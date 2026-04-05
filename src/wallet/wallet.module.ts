import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { UserModule } from '../user/user.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';

@Module({
  imports: [UserModule, HyperliquidModule, ConfigModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
