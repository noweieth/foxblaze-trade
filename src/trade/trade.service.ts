import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OpenPositionJob, ClosePositionJob, SetTpSlJob, CancelOrderJob } from './trade.types';
import { RiskService } from './risk.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    @InjectQueue('trade_queue') private readonly tradeQueue: Queue,
    private readonly riskService: RiskService,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService
  ) {}

  async queueOpenPosition(params: OpenPositionJob) {
    const wallet = await this.walletService.getWalletByUserId(params.userId);
    if (!wallet) throw new InternalServerErrorException('Trade session failed: User wallet not found!');

    const user = await this.prisma.user.findUnique({ where: { id: params.userId } });
    const isPremium = user?.isPremium || false;

    // Block risks before queueing (Throws Error if violated)
    await this.riskService.checkSafety(wallet.address, parseFloat(params.size), params.leverage, isPremium);

    this.logger.log(`[Queue] Adding OPEN_POSITION for userId ${params.userId}`);
    await this.tradeQueue.add('OPEN_POSITION', params);
  }

  async queueClosePosition(params: ClosePositionJob) {
    this.logger.log(`[Queue] Adding CLOSE_POSITION for userId ${params.userId}`);
    await this.tradeQueue.add('CLOSE_POSITION', params);
  }

  async queueSetTpSl(params: SetTpSlJob) {
    this.logger.log(`[Queue] Adding SET_TP_SL for userId ${params.userId}`);
    await this.tradeQueue.add('SET_TP_SL', params);
  }

  async queueCancelOrder(params: CancelOrderJob) {
    this.logger.log(`[Queue] Adding CANCEL_ORDER for userId ${params.userId}`);
    await this.tradeQueue.add('CANCEL_ORDER', params);
  }
}
