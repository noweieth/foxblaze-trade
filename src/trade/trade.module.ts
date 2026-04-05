import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TradeService } from './trade.service';
import { TradeProcessor } from './trade.processor';
import { RiskService } from './risk.service';
import { WalletModule } from '../wallet/wallet.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from '../telegram/notification.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    WalletModule,
    HyperliquidModule,
    ConfigModule,
    CommonModule,
    BullModule.registerQueue({
      name: 'trade_queue',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      }
    })
  ],
  providers: [TradeService, TradeProcessor, RiskService, NotificationService],
  exports: [TradeService, RiskService],
})
export class TradeModule {}
