import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';

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
import { TestHandler } from './handlers/test.handler';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot;

  constructor(
    private readonly config: ConfigService,
    private readonly startHandler: StartHandler,
    private readonly depositHandler: DepositHandler,
    private readonly balanceHandler: BalanceHandler,
    private readonly tradeHandler: TradeHandler,
    private readonly positionHandler: PositionHandler,
    private readonly orderHandler: OrderHandler,
    private readonly historyHandler: HistoryHandler,
    private readonly infoHandler: InfoHandler,
    private readonly chartHandler: ChartHandler,
    private readonly helpHandler: HelpHandler,
    private readonly pnlHandler: PnlHandler,
    private readonly testHandler: TestHandler,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('⚠️ TELEGRAM_BOT_TOKEN missing in .env! Telegram Bot will crash or stay idle.');
      this.bot = new Bot("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"); 
    } else {
      this.bot = new Bot(token);
    }
  }

  async onModuleInit() {
    this.registerHandlers();
    
    try {
      await this.bot.api.setMyCommands([
        { command: 'start', description: 'Create wallet & initialize DEX' },
        { command: 'deposit', description: 'How to deposit USDC (Arbitrum)' },
        { command: 'balance', description: 'View L1 & Margin balance' },
        { command: 'long', description: 'Open LONG position' },
        { command: 'short', description: 'Open SHORT position' },
        { command: 'positions', description: 'Manage active positions' },
        { command: 'orders', description: 'Manage pending orders' },
        { command: 'history', description: 'View trade history' },
        { command: 'pnl', description: 'View PnL analysis chart' },
        { command: 'help', description: 'View all commands & guides' },
      ]);
      this.logger.log('Thành công set Telegram Bot Menu Commands');
    } catch (e: any) {
      this.logger.error(`Lỗi khi set commands: ${e.message}`);
    }

    try {
      this.bot.start({
        onStart: (botInfo) => {
          this.logger.log(`🤖 Telegram Framework Khởi Động: [${botInfo.username}] in polling mode!`);
        }
      });
    } catch (e: any) {
      this.logger.error(`GrammY Bot Startup Lỗi: ${e.message}`);
    }
  }

  onModuleDestroy() {
    this.bot.stop();
  }

  private registerHandlers() {
    // 1. Static Command Handlers
    this.startHandler.register(this.bot);
    this.depositHandler.register(this.bot);
    this.balanceHandler.register(this.bot);
    this.tradeHandler.register(this.bot);
    this.positionHandler.register(this.bot);
    this.orderHandler.register(this.bot);
    this.historyHandler.register(this.bot);
    this.infoHandler.register(this.bot);
    this.chartHandler.register(this.bot);
    this.helpHandler.register(this.bot);
    this.pnlHandler.register(this.bot);
    this.testHandler.register(this.bot);

    // 2. FSM Fallback Message Interceptor
    this.bot.on('message:text', async (ctx: Context) => {
      if (!ctx.from || !ctx.message || !ctx.message.text) return;
      // Tránh cướp các lệnh command (/start, /long...)
      if (ctx.message.text.startsWith('/')) {
         // Nếu là /skip thì TradeHandler FSM đang chờ
         if (ctx.message.text !== '/skip') return;
      }
      
      const telegramId = BigInt(ctx.from.id);
      await this.tradeHandler.handleTextMessage(ctx, telegramId, ctx.message.text);
    });

    // 3. Callback Query Interceptor
    this.bot.on('callback_query:data', async (ctx: Context) => {
      if (!ctx.from || !ctx.callbackQuery) return;
      const cbData = ctx.callbackQuery.data;
      if (!cbData) return;
      
      const telegramId = BigInt(ctx.from.id);
      
      let isHandled = await this.tradeHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.chartHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.depositHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.positionHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.orderHandler.handleCallbackQuery(ctx, telegramId, cbData);
      
      try {
        await ctx.answerCallbackQuery(); // Tắt vòng loading cho Nút bấm Telegram
      } catch(e) {}
    });
  }

  async sendMessage(chatId: number | string, text: string, options: any = { parse_mode: 'HTML' }) {
    await this.bot.api.sendMessage(chatId, text, options);
  }

  async stopPolling() {
    await this.bot.stop();
  }

  async startPolling() {
    this.bot.catch((err) => {
      this.logger.error(`Unhandled Telegram Error: ${err.message}`);
    });

    this.bot.start({
      onStart: (botInfo) => {
        this.logger.log(`🤖 Telegram Framework Resume: [${botInfo.username}]`);
      }
    });
  }
}
