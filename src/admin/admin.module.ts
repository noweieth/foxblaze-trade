import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { CommonModule } from '../common/common.module';
import { ConfigModule } from '@nestjs/config';
import { TradeModule } from '../trade/trade.module';
import { WalletModule } from '../wallet/wallet.module';
import { SignalModule } from '../signal/signal.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [PrismaModule, TelegramModule, HyperliquidModule, CommonModule, ConfigModule, TradeModule, WalletModule, SignalModule, UserModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
