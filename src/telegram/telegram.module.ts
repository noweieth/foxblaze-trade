import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { SessionModule } from '../session/session.module';
import { TradeModule } from '../trade/trade.module';

import { StartHandler } from './handlers/start.handler';
import { DepositHandler } from './handlers/deposit.handler';
import { BalanceHandler } from './handlers/balance.handler';
import { TradeHandler } from './handlers/trade.handler';
import { PositionHandler } from './handlers/position.handler';
import { OrderHandler } from './handlers/order.handler';
import { HistoryHandler } from './handlers/history.handler';
import { InfoHandler } from './handlers/info.handler';
import { ChartHandler } from './handlers/chart.handler';
import { HelpHandler } from './handlers/help.handler';
import { PnlHandler } from './handlers/pnl.handler';
import { PrismaModule } from '../prisma/prisma.module';
import { DepositModule } from '../deposit/deposit.module';
import { CardRenderer } from './card-renderer.service';
import { TestHandler } from './handlers/test.handler';
import { PremiumHandler } from './handlers/premium.handler';
import { WithdrawHandler } from './handlers/withdraw.handler';
import { KolHandler } from './handlers/kol.handler';

@Module({
  imports: [ConfigModule, UserModule, WalletModule, HyperliquidModule, SessionModule, TradeModule, PrismaModule, DepositModule],
  providers: [
    TelegramService,
    StartHandler,
    DepositHandler,
    BalanceHandler,
    TradeHandler,
    PositionHandler,
    OrderHandler,
    HistoryHandler,
    InfoHandler,
    ChartHandler,
    HelpHandler,
    PnlHandler,
    CardRenderer,
    TestHandler,
    PremiumHandler,
    WithdrawHandler,
    KolHandler,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
