import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeService } from '../trade/trade.service';
import { UserService } from '../user/user.service';
import { HlInfoService } from '../hyperliquid/hl-info.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateSignalDto } from './signal.types';

@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService,
    private readonly hlInfo: HlInfoService,
    private readonly telegram: TelegramService,
  ) {}

  async createSignal(dto: CreateSignalDto) {
    // 1. Validate asset
    const assetMeta = await this.hlInfo.findAsset(dto.asset);
    if (!assetMeta) {
      throw new NotFoundException(`Asset ${dto.asset} not found on Hyperliquid`);
    }

    // 2. Save signal to DB
    const signal = await (this.prisma as any).signal.create({
      data: {
        asset: assetMeta.name,
        assetId: assetMeta.assetId,
        side: dto.side,
        entryPrice: dto.entryPrice,
        takeProfitPrice: dto.takeProfitPrice,
        stopLossPrice: dto.stopLossPrice,
        leverage: dto.leverage,
        note: dto.note,
        status: 'ACTIVE',
      },
    });

    // 3. Get Premium Users
    const premiumUsers = await this.userService.getPremiumUsers();
    
    let executedCount = 0;
    let notifiedCount = 0;

    // 4 & 5. Execute and Notify
    const signalMessage = `
📢 <b>PREMIUM SIGNAL: ${signal.asset}</b>
🔹 Side: ${signal.side.toUpperCase()}
🎯 Entry: $${signal.entryPrice}
📈 TP: $${signal.takeProfitPrice}
🛑 SL: $${signal.stopLossPrice}
🚀 Leverage: ${signal.leverage}x
${signal.note ? `\n📝 Note: ${signal.note}` : ''}
`;

    for (const user of premiumUsers) {
      try {
        // Notify
        await this.telegram.sendMessage(user.telegramId.toString(), signalMessage);
        notifiedCount++;

        // Execute if autoCopy and wallet exists
        if (user.autoCopy && (user as any).wallet?.isHlRegistered) {
          await this.tradeService.queueOpenPosition({
            userId: user.id,
            asset: signal.assetId,
            isBuy: signal.side === 'long',
            size: user.copySize.toString(), // Default copySize is in USDC
            leverage: signal.leverage,
            tp: signal.takeProfitPrice.toString(),
            sl: signal.stopLossPrice.toString(),
            signalId: signal.id,
          });
          executedCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50)); // rate limit bot messages
      } catch (e: any) {
        this.logger.error(`Error processing signal for user ${user.id}: ${e.message}`);
      }
    }

    this.logger.log(`Signal ${signal.id} created: executed ${executedCount}, notified ${notifiedCount}`);

    return {
      status: 'success',
      data: signal,
      executedCount,
      notifiedCount,
    };
  }

  async closeSignal(signalId: number) {
    const signal = await (this.prisma as any).signal.findUnique({ where: { id: signalId } });
    if (!signal) throw new NotFoundException('Signal not found');
    if (signal.status !== 'ACTIVE') throw new Error('Signal is already closed or cancelled');

    const updatedSignal = await (this.prisma as any).signal.update({
      where: { id: signalId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    // Find active trades
    const trades = await this.prisma.trade.findMany({
      where: {
        signalId,
        status: 'OPEN',
      } as any,
      include: {
        user: true,
      },
    });

    let closedCount = 0;
    const notifyMessage = `⚠️ <b>SIGNAL CLOSED: ${signal.asset}</b>\nThe system is closing related copytrade positions.`;

    for (const trade of trades) {
      try {
        await this.tradeService.queueClosePosition({
          userId: trade.userId,
          asset: signal.assetId,
          size: trade.size.toString(),
          currentSide: trade.side,
          chatId: (trade as any).user.telegramId.toString(),
        });
        
        await this.telegram.sendMessage((trade as any).user.telegramId.toString(), notifyMessage);
        closedCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e: any) {
        this.logger.error(`Error closing signal trade for user ${trade.userId}: ${e.message}`);
      }
    }

    return {
      status: 'success',
      data: updatedSignal,
      closedCount,
    };
  }

  async getActiveSignals() {
    const signals = await (this.prisma as any).signal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { trades: true } },
      },
    });
    return { status: 'success', data: signals };
  }

  async getSignalHistory(limit: number = 20) {
    const signals = await (this.prisma as any).signal.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { trades: true } },
      },
    });
    return { status: 'success', data: signals };
  }
}
