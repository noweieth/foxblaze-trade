import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DepositService } from './deposit.service';
import { DepositProcessor } from './deposit.processor';
import { WalletModule } from '../wallet/wallet.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    WalletModule,
    HyperliquidModule,
    ConfigModule,
    BullModule.registerQueue({
      name: 'deposit_queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      }
    })
  ],
  providers: [DepositService, DepositProcessor],
  exports: [DepositService]
})
export class DepositModule {}
