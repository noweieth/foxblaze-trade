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
import { PremiumHandler } from './handlers/premium.handler';
import { WithdrawHandler } from './handlers/withdraw.handler';

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
    private readonly premiumHandler: PremiumHandler,
    private readonly withdrawHandler: WithdrawHandler,
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
      const botCommands = [
        { command: 'start', description: 'Get started & create wallet' },
        { command: 'deposit', description: 'Deposit USDC (Arbitrum)' },
        { command: 'balance', description: 'Account overview' },
        { command: 'chart', description: 'Interactive price chart' },
        { command: 'long', description: 'Open LONG position' },
        { command: 'short', description: 'Open SHORT position' },
        { command: 'positions', description: 'Active positions' },
        { command: 'orders', description: 'Pending orders' },
        { command: 'pnl', description: 'PnL analysis' },
        { command: 'withdraw', description: 'Withdraw USDC to external wallet' },
        { command: 'premium', description: '⭐ Premium Features' },
        { command: 'help', description: 'Commands & guides' },
      ];

      const publicBotCommands = botCommands.filter(c => ['start', 'help', 'chart', 'pnl'].includes(c.command));

      await this.bot.api.setMyCommands(botCommands);
      await this.bot.api.setMyCommands(botCommands, { scope: { type: 'all_private_chats' } });
      await this.bot.api.setMyCommands(publicBotCommands, { scope: { type: 'all_group_chats' } });
      await this.bot.api.setMyCommands(publicBotCommands, { scope: { type: 'all_chat_administrators' } });
      await this.bot.api.setMyDescription('FoxBlaze Trading Bot - The next-gen autonomous Hyperliquid trader.\\n\\n📖 Read the manual: https://docs.foxblaze.bot/en').catch(() => {});
      this.logger.log('Successfully set Telegram Bot Menu Commands (Default, Private & Group Scopes)');
    } catch (e: any) {
      this.logger.error(`Error setting commands: ${e.message}`);
    }

    try {
      this.bot.start({
        onStart: (botInfo) => {
          this.logger.log(`🤖 Telegram Framework Started: [${botInfo.username}] in polling mode!`);
        }
      });
    } catch (e: any) {
      this.logger.error(`GrammY Bot Startup Error: ${e.message}`);
    }
  }

  onModuleDestroy() {
    this.bot.stop();
  }

  private registerHandlers() {
    // 0. Group/Private Scope Middleware
    this.bot.use(async (ctx: Context, next) => {
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
      
      if (isGroup) {
        // 1. Block sensitive commands in groups
        if (ctx.message?.text?.startsWith('/')) {
          const rawCommand = ctx.message.text.split(' ')[0].substring(1);
          const cmd = rawCommand.split('@')[0].toLowerCase();
          
          const publicCommands = ['start', 'help', 'chart', 'markets', 'info', 'pnl']; // PnL is safe to flex in groups
          if (!publicCommands.includes(cmd)) {
             await ctx.reply("🔒 <b>Private Command</b>\nThis action requires wallet interaction or shows sensitive data. Please DM the bot to use it.", {
               reply_parameters: { message_id: ctx.message.message_id },
               parse_mode: 'HTML'
             });
             return; // Stop execution for private commands
          }
        }
        // 2. Block sensitive callback queries (button clicks) in groups
        else if (ctx.callbackQuery && ctx.callbackQuery.data) {
           const cbData = ctx.callbackQuery.data;
           const isPrivateAction = 
                 cbData.startsWith('nav_deposit') || 
                 cbData.startsWith('nav_balance') ||
                 cbData.startsWith('nav_long') ||
                 cbData.startsWith('nav_short') ||
                 cbData.startsWith('nav_withdraw') ||
                 cbData.startsWith('nav_premium') ||
                 cbData.startsWith('close_') ||
                 cbData.startsWith('cancel_') ||
                 cbData.startsWith('trade_') ||
                 cbData.startsWith('withdraw_');

           if (isPrivateAction) {
              await ctx.answerCallbackQuery({
                 text: '🔒 Please DM the bot to use this feature.',
                 show_alert: true
              });
              return; // Stop execution
           }
        }
      }
      
      await next();
    });

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
    this.premiumHandler.register(this.bot);
    this.withdrawHandler.register(this.bot);

    // 2. FSM Fallback Message Interceptor
    this.bot.on('message:text', async (ctx: Context) => {
      if (!ctx.from || !ctx.message || !ctx.message.text) return;
      
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
      // Only process free text (amount, address) in Private Chat. Group chat is strictly blocked.
      if (isGroup) return;

      // Avoid hijacking commands (/start, /long...)
      if (ctx.message.text.startsWith('/')) {
         // If /skip, TradeHandler FSM might be waiting
         if (ctx.message.text !== '/skip') return;
      }
      
      const telegramId = BigInt(ctx.from.id);
      let handled = await this.withdrawHandler.handleTextInput(ctx, telegramId, ctx.message.text);
      if (!handled) {
        await this.tradeHandler.handleTextMessage(ctx, telegramId, ctx.message.text);
      }
    });

    // 3. Callback Query Interceptor
    this.bot.on('callback_query:data', async (ctx: Context) => {
      if (!ctx.from || !ctx.callbackQuery) return;
      const cbData = ctx.callbackQuery.data;
      if (!cbData) return;
      
      const telegramId = BigInt(ctx.from.id);
      
      let isHandled = await this.tradeHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.withdrawHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.chartHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.depositHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.positionHandler.handleCallbackQuery(ctx, telegramId, cbData);
      if (!isHandled) isHandled = await this.orderHandler.handleCallbackQuery(ctx, telegramId, cbData);
      
      if (!isHandled) {
         if (cbData === 'nav_deposit') { await this.depositHandler.handleDeposit(ctx); isHandled = true; }
         else if (cbData === 'nav_balance') { await this.balanceHandler.handleBalance(ctx); isHandled = true; }
         else if (cbData === 'nav_help') { await this.helpHandler.handleHelp(ctx); isHandled = true; }
         else if (cbData === 'nav_long') { await (this.tradeHandler as any).initTrade(ctx, 'long'); isHandled = true; }
         else if (cbData === 'nav_short') { await (this.tradeHandler as any).initTrade(ctx, 'short'); isHandled = true; }
         else if (cbData === 'nav_markets') { (this.infoHandler as any).handleMarkets(ctx); isHandled = true; }
      }
      
      try {
        await ctx.answerCallbackQuery(); // Hide loading spinner for Telegram buttons
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
