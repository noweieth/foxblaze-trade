import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OpenPositionJob, ClosePositionJob, SetTpSlJob, CancelOrderJob } from './trade.types';
import { RiskService } from './risk.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    @InjectQueue('trade_queue') private readonly tradeQueue: Queue,
    private readonly riskService: RiskService,
    private readonly walletService: WalletService
  ) {}

  async queueOpenPosition(params: OpenPositionJob) {
    const wallet = await this.walletService.getWalletByUserId(params.userId);
    if (!wallet) throw new InternalServerErrorException('Phiên giao dịch thất bại: Không tìm thấy ví người dùng!');

    // Chặn rủi ro trước khi thả vào hàng đợi (Throw Error nếu vi phạm)
    await this.riskService.checkSafety(wallet.address, parseFloat(params.size), params.leverage);

    this.logger.log(`[Queue] Adding OPEN_POSITION cho userId ${params.userId}`);
    await this.tradeQueue.add('OPEN_POSITION', params);
  }

  async queueClosePosition(params: ClosePositionJob) {
    this.logger.log(`[Queue] Adding CLOSE_POSITION cho userId ${params.userId}`);
    await this.tradeQueue.add('CLOSE_POSITION', params);
  }

  async queueSetTpSl(params: SetTpSlJob) {
    this.logger.log(`[Queue] Adding SET_TP_SL cho userId ${params.userId}`);
    await this.tradeQueue.add('SET_TP_SL', params);
  }

  async queueCancelOrder(params: CancelOrderJob) {
    this.logger.log(`[Queue] Adding CANCEL_ORDER cho userId ${params.userId}`);
    await this.tradeQueue.add('CANCEL_ORDER', params);
  }
}
