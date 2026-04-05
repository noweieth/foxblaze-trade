import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private isBotPolling = true;

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService
  ) {}

  async getInsights() {
    const totalUsers = await this.prisma.user.count();
    const activeWallets = await this.prisma.wallet.count({
      where: { isHlRegistered: true }
    });
    
    // Aggregate Trades statistics
    const trades = await this.prisma.trade.findMany();
    
    let totalTrades = trades.length;
    let openPositions = 0;
    let totalPnl = 0;
    
    for (const t of trades) {
      if (t.status === 'OPEN') {
        openPositions++;
      } else if (t.status === 'CLOSED') {
        totalPnl += (t.pnl || 0);
      }
    }

    return {
      status: 'success',
      data: {
        totalUsers,
        activeWallets,
        totalTrades,
        openPositions,
        totalPnl: totalPnl.toFixed(2),
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
}
