import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { HyperliquidModule } from './hyperliquid/hyperliquid.module';
import { SessionModule } from './session/session.module';
import { TradeModule } from './trade/trade.module';
import { DepositModule } from './deposit/deposit.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule, 
    CommonModule, 
    PrismaModule, 
    UserModule, 
    WalletModule, 
    HyperliquidModule, 
    SessionModule,
    TradeModule,
    DepositModule,
    TelegramModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
