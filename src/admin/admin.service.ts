import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { HlInfoService } from '../hyperliquid/hl-info.service';
import { RedisService } from '../common/redis.service';
import { ConfigService } from '@nestjs/config';
import { TradeService } from '../trade/trade.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private isBotPolling = true;

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private hlInfo: HlInfoService,
    private redis: RedisService,
    private config: ConfigService,
    private trade: TradeService
  ) {}

  async getInsights() {
    const [totalUsers, activeBots, trades, wallets] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.trade.findMany(),
      this.prisma.wallet.findMany({ where: { isHlRegistered: true } })
    ]);
    
    // Aggregate DB stats
    let totalTrades = trades.length;
    let openPositions = 0, realizedPnl = 0, totalVolume = 0;
    let wins = 0;
    let closedTrades = 0;
    
    for (const t of trades) {
      if (t.status === 'OPEN') {
        openPositions++;
      } else if (t.status === 'CLOSED') {
        closedTrades++;
        if (t.pnl && t.pnl > 0) wins++;
        realizedPnl += (t.pnl || 0);
        totalVolume += (t.size * (t.entryPrice || 0));
      }
    }
    
    const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

    // On-chain aggregation
    let totalEquity = 0, totalUnrealizedPnl = 0, totalMarginUsed = 0;
    for (const w of wallets) {
      try {
        const state = await this.hlInfo.getAccountState(w.address);
        totalEquity += parseFloat(state.equity || '0');
        totalUnrealizedPnl += parseFloat(state.totalPnl || '0');
        totalMarginUsed += parseFloat(state.marginUsed || '0');
      } catch(e) {
        // Skip silently if error
      }
    }

    return {
      status: 'success',
      data: {
        totalUsers,
        activeBots,
        totalTrades,
        winRate: winRate.toFixed(2),
        openPositions,
        realizedPnl: realizedPnl.toFixed(2),
        totalVolume: totalVolume.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
        totalUnrealizedPnl: totalUnrealizedPnl.toFixed(2),
        totalMarginUsed: totalMarginUsed.toFixed(2),
        systemHealth: this.isBotPolling ? 'Optimal' : 'Stopped',
        serverTime: new Date().toISOString()
      }
    };
  }

  async broadcast(message: string) {
    const users = await this.prisma.user.findMany();
    let count = 0;
    for (const u of users) {
      try {
        await this.telegram.sendMessage(u.telegramId.toString(), `🔴 <b>SYSTEM BROADCAST</b>\n\n${message}`);
        count++;
        await new Promise(resolve => setTimeout(resolve, 50)); // Rate limit 50ms
      } catch(e) {}
    }
    this.logger.log(`Broadcasted to ${count} users.`);
    return { status: 'success', sent: count };
  }

  async toggleSystem() {
    if (this.isBotPolling) {
      await this.telegram.stopPolling();
      this.isBotPolling = false;
      this.logger.warn('Bot polling stopped by Admin.');
    } else {
      await this.telegram.startPolling();
      this.isBotPolling = true;
      this.logger.log('Bot polling resumed by Admin.');
    }
    return { status: 'success', isPolling: this.isBotPolling };
  }

  async getAnalytics() {
    // 1. Calculate General Stats (Win Rate, Estimated Revenue)
    const trades = await this.prisma.trade.findMany({ where: { status: 'CLOSED' } });
    let wins = 0;
    let totalVolume = 0;
    
    // Asset Aggregation
    const assetStats: Record<string, { volume: number, pnl: number }> = {};
    // User Aggregation
    const userStats: Record<string, { pnl: number, volume: number }> = {};

    for (const t of trades) {
      if (t.pnl && t.pnl > 0) wins++;
      const vol = (t.size * (t.entryPrice || 0));
      totalVolume += vol;
      
      const asset = t.asset || 'UNKNOWN';
      if (!assetStats[asset]) assetStats[asset] = { volume: 0, pnl: 0 };
      assetStats[asset].volume += vol;
      assetStats[asset].pnl += (t.pnl || 0);

      const uId = t.userId.toString();
      if (!userStats[uId]) userStats[uId] = { pnl: 0, volume: 0 };
      userStats[uId].pnl += (t.pnl || 0);
      userStats[uId].volume += vol;
    }

    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    
    // Revenue is Builder Fee = Volume * config.BUILDER_FEE. (Fall-back to 0.1 / 100)
    const builderFeeRate = parseFloat(this.config.get<string>('BUILDER_FEE', '0.1')) / 100;
    const estRevenue = totalVolume * builderFeeRate;

    // 2. Top Assets (Top 5 by Volume)
    const topAssets = Object.keys(assetStats).map(a => ({
      asset: a,
      volume: assetStats[a].volume,
      pnl: assetStats[a].pnl
    })).sort((a, b) => b.volume - a.volume).slice(0, 5);

    // 3. Top Users (Top 10 by PNL)
    const topUsersRaw = Object.keys(userStats).map(id => ({
      userId: parseInt(id),
      pnl: userStats[id].pnl,
      volume: userStats[id].volume
    })).sort((a, b) => b.pnl - a.pnl).slice(0, 10);
    
    // Attach username
    const topUsers = [];
    for (const tu of topUsersRaw) {
      const u = await this.prisma.user.findUnique({ where: { id: tu.userId } });
      if (u) {
        topUsers.push({
          username: u.username || u.firstName || `User${u.id}`,
          pnl: tu.pnl,
          volume: tu.volume
        });
      }
    }

    return {
      status: 'success',
      data: {
        winRate: winRate.toFixed(1),
        estimatedRevenue: estRevenue.toFixed(2),
        totalVolume: totalVolume.toFixed(2),
        topAssets,
        topUsers
      }
    };
  }

  async getTableData(type: string) {
    if (type === 'wallets') {
       const wallets = await this.prisma.wallet.findMany({
         take: 20,
         orderBy: { createdAt: 'desc' },
         include: { user: true }
       });
       return wallets.map(w => ({
         id: w.address.substring(0,6) + '...' + w.address.slice(-4),
         name: w.user.username ? `@${w.user.username}` : w.user.firstName || `User ${w.userId}`,
         status: w.isHlRegistered ? 'Active' : 'Inactive',
         pnl: '$0.00',
         date: new Date(w.createdAt).toLocaleDateString()
       }));
    } else if (type === 'history') {
       const history = await this.prisma.trade.findMany({
         take: 20,
         orderBy: { createdAt: 'desc' },
         where: { status: 'CLOSED' },
         include: { user: true }
       });
       return history.map(t => ({
         id: `${t.side.toUpperCase()} ${t.size}x • ${t.asset}`,
         name: t.user.username ? `@${t.user.username}` : t.user.firstName || `User ${t.userId}`,
         status: 'Closed',
         pnl: t.pnl ? (t.pnl > 0 ? `+$${t.pnl}` : `-$${Math.abs(t.pnl)}`) : '$0.00',
         date: new Date(t.createdAt).toLocaleDateString()
       }));
    } else if (type === 'orders') {
       const open = await this.prisma.trade.findMany({
         take: 20,
         orderBy: { createdAt: 'desc' },
         where: { status: 'OPEN' },
         include: { user: true }
       });
       return open.map(t => ({
         id: `${t.side.toUpperCase()} Active • ${t.asset}`,
         name: t.user.username ? `@${t.user.username}` : t.user.firstName || `User ${t.userId}`,
         status: 'Open',
         pnl: 'Unrealized',
         date: new Date(t.createdAt).toLocaleDateString()
       }));
    }
    return [];
  }

  async getUsersChartData(range: string) {
    const days = range === '30d' ? 30 : range === '7d' ? 7 : range === 'all' ? 365 : 1;
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const users = await this.prisma.user.findMany({
      where: range !== 'all' ? { createdAt: { gte: since } } : undefined,
      orderBy: { createdAt: 'asc' }
    });
    
    // Group by date
    const dailyRegistrations: Record<string, number> = {};
    for (const u of users) {
      const dateKey = u.createdAt?.toISOString().slice(0,10) || '';
      if (dateKey) {
        dailyRegistrations[dateKey] = (dailyRegistrations[dateKey] || 0) + 1;
      }
    }
    
    // Convert to cumulative
    // Find initial user count before the 'since' date to start the baseline
    const pastUsers = range !== 'all' ? await this.prisma.user.count({ where: { createdAt: { lt: since } } }) : 0;
    
    let cumulative = pastUsers;
    const labels: string[] = [];
    const values: number[] = [];
    
    const sortedDates = Object.keys(dailyRegistrations).sort();
    if (sortedDates.length === 0) {
      labels.push(since.toISOString().slice(0,10), new Date().toISOString().slice(0,10));
      values.push(cumulative, cumulative);
      return { status: 'success', data: { labels, values } };
    }
    
    for (const d of sortedDates) {
      cumulative += dailyRegistrations[d];
      labels.push(d);
      values.push(cumulative);
    }
    
    // Add current date if missing from the end
    const today = new Date().toISOString().slice(0,10);
    if (labels[labels.length - 1] !== today) {
      labels.push(today);
      values.push(cumulative);
    }
    
    return { status: 'success', data: { labels, values } };
  }

  async getUsers(page: number, search?: string) {
    const pageSize = 20;
    const where = search ? {
      OR: [
        { username: { contains: search, mode: 'insensitive' as any } },
        { firstName: { contains: search, mode: 'insensitive' as any } }
      ]
    } : {};
    
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { wallet: true, _count: { select: { trades: true, deposits: true } } }
      }),
      this.prisma.user.count({ where })
    ]);
    
    return {
      status: 'success',
      data: users.map(u => ({
        id: u.id,
        telegramId: u.telegramId.toString(),
        username: u.username,
        firstName: u.firstName,
        isActive: u.isActive,
        walletAddress: u.wallet?.address || null,
        isHlRegistered: u.wallet?.isHlRegistered || false,
        tradeCount: u._count.trades,
        depositCount: u._count.deposits,
        createdAt: u.createdAt
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };
  }
  
  async getUserDetail(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        trades: { orderBy: { createdAt: 'desc' }, take: 50 },
        deposits: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });
    if (!user) return { status: 'error', message: 'User not found' };
    
    // Format BigInt
    return { 
      status: 'success', 
      data: {
        ...user,
        telegramId: user.telegramId.toString(),
      } 
    };
  }
  
  async getUserBalance(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || !wallet.isHlRegistered) {
      return { status: 'success', data: { equity: '0', available: '0', margin: '0', positions: [] } };
    }
    const [state, positions] = await Promise.all([
      this.hlInfo.getAccountState(wallet.address),
      this.hlInfo.getPositions(wallet.address)
    ]);
    return {
      status: 'success',
      data: {
        equity: state.equity,
        available: state.availableBalance,
        margin: state.marginUsed,
        unrealizedPnl: state.totalPnl,
        positions: positions.filter(p => parseFloat(p.size) !== 0)
      }
    };
  }
  
  async sendUserMessage(userId: number, message: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { status: 'error', message: 'User not found' };
    try {
      await this.telegram.sendMessage(user.telegramId.toString(), `📬 <b>ADMIN MESSAGE</b>\n\n${message}`);
      return { status: 'success' };
    } catch (e) {
      this.logger.error(`Failed to send message to user ${userId}:`, e);
      return { status: 'error', message: 'Failed to send Telegram message' };
    }
  }

  async toggleUserActive(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { status: 'error', message: 'User not found' };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive }
    });
    return { status: 'success', isActive: updated.isActive };
  }

  async getAllOpenPositions() {
    const wallets = await this.prisma.wallet.findMany({
      where: { isHlRegistered: true },
      include: { user: true }
    });
    
    let allPositions: any[] = [];
    
    for (const w of wallets) {
      try {
        const [state, positions] = await Promise.all([
          this.hlInfo.getAccountState(w.address),
          this.hlInfo.getPositions(w.address)
        ]);
        
        const activePos = positions.filter(p => parseFloat(p.size) !== 0);
        if (activePos.length === 0) continue;
        
        const eq = parseFloat(state.equity || '0');
        const margin = parseFloat(state.marginUsed || '0');
        const marginRatio = eq > 0 ? (margin / eq) * 100 : 0;
        const isHighRisk = marginRatio > 70;
        
        const username = w.user.username ? `@${w.user.username}` : w.user.firstName || 'User';
        
        activePos.forEach(p => {
          allPositions.push({
            user: username,
            userId: w.userId,
            asset: p.asset,
            side: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            unrealizedPnl: p.unrealizedPnl,
            leverage: p.leverage,
            marginRatio: marginRatio.toFixed(2),
            isHighRisk
          });
        });
      } catch (e) {
        // silently skip errors
      }
    }
    
    return { status: 'success', data: allPositions };
  }

  async getSystemHealth() {
    let redisStatus = 'Offline';
    try {
      if (await this.redis.client.ping() === 'PONG') {
        redisStatus = 'Optimal';
      }
    } catch (e) {
      this.logger.warn('Redis health check failed');
    }
    
    return {
      status: 'success',
      data: {
        botActive: this.isBotPolling,
        redisStatus,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().rss
      }
    };
  }

  async getRuntimeConfig() {
    let raw = await this.redis.client.get('runtime:config');
    let config = raw ? JSON.parse(raw) : {};
    
    // Fallback to ConfigService if not set in Redis
    const currentConfig = {
      MAX_OPEN_POSITIONS: config.MAX_OPEN_POSITIONS ?? this.config.get<number>('MAX_OPEN_POSITIONS', 5),
      MAX_MARGIN_RATIO: config.MAX_MARGIN_RATIO ?? this.config.get<number>('MAX_MARGIN_RATIO', 0.85),
      MAX_POSITION_SIZE_USD: config.MAX_POSITION_SIZE_USD ?? this.config.get<number>('MAX_POSITION_SIZE_USD', 5000),
      BUILDER_FEE: this.config.get<number>('BUILDER_FEE', 0.1),
      REFERRER_FEE: this.config.get<number>('REFERRER_FEE', 0.1)
    };
    
    return { status: 'success', data: currentConfig };
  }

  async updateRuntimeConfig(body: any) {
    const raw = await this.redis.client.get('runtime:config');
    let config = raw ? JSON.parse(raw) : {};
    
    if (body.MAX_OPEN_POSITIONS !== undefined) config.MAX_OPEN_POSITIONS = Number(body.MAX_OPEN_POSITIONS);
    if (body.MAX_MARGIN_RATIO !== undefined) config.MAX_MARGIN_RATIO = Number(body.MAX_MARGIN_RATIO);
    if (body.MAX_POSITION_SIZE_USD !== undefined) config.MAX_POSITION_SIZE_USD = Number(body.MAX_POSITION_SIZE_USD);
    
    await this.redis.client.set('runtime:config', JSON.stringify(config));
    
    return { status: 'success', data: config };
  }

  async emergencyCloseAll() {
    this.logger.warn('!!! EMERGENCY CLOSE ALL TRIGGERED !!!');
    const wallets = await this.prisma.wallet.findMany({ where: { isHlRegistered: true } });
    
    let totalQueued = 0;
    for (const w of wallets) {
      try {
        const positions = await this.hlInfo.getPositions(w.address);
        const activePos = positions.filter(p => parseFloat(p.size) !== 0);
        
        for (const p of activePos) {
          const assetMeta = await this.hlInfo.findAsset(p.asset);
          if (assetMeta) {
            await this.trade.queueClosePosition({
              userId: w.userId,
              asset: assetMeta.assetId,
              size: p.size,
              currentSide: p.side
            });
            totalQueued++;
          }
        }
      } catch(e: any) {
        this.logger.error(`Failed to close positions for ${w.address}: ${e.message}`);
      }
    }
    return { status: 'success', message: `${totalQueued} positions queued for emergency close.` };
  }
}
