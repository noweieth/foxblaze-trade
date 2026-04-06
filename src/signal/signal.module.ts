import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TradeModule } from '../trade/trade.module';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ConfigModule } from '@nestjs/config';
import { SignalService } from './signal.service';

@Module({
  imports: [
    PrismaModule,
    TradeModule,
    UserModule,
    WalletModule,
    HyperliquidModule,
    TelegramModule,
    ConfigModule,
  ],
  providers: [SignalService],
  exports: [SignalService],
})
export class SignalModule {}
