import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context } from 'grammy';
import { UserService } from '../../user/user.service';
import { SessionService } from '../../session/session.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { TradeService } from '../../trade/trade.service';
import { buildOrderPanelKeyboard } from '../keyboards/inline.keyboard';

@Injectable()
export class TradeHandler {
  private readonly logger = new Logger(TradeHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly hlInfo: HlInfoService,
    private readonly tradeService: TradeService,
  ) {}

  register(bot: Bot) {
    bot.command('long', async (ctx: Context) => this.initTrade(ctx, 'long'));
    bot.command('short', async (ctx: Context) => this.initTrade(ctx, 'short'));
    bot.command('cancel', async (ctx: Context) => {
      if (!ctx.from) return;
      const telegramId = BigInt(ctx.from.id);
      await this.sessionService.clear(telegramId);
      await ctx.reply(`❌ Trade setup session cancelled and all pending states cleared.`);
    });
  }

  private async initTrade(ctx: Context, side: 'long' | 'short') {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    
    // Yêu cầu nhập Asset trước để làm cơ sở
    await this.sessionService.set(telegramId, {
      state: 'WAITING_ASSET_INPUT',
      data: { side }
    });

    await ctx.reply(`🦊 Setting up a <b>${side.toUpperCase()}</b> position.\nEnter the Asset Ticker (e.g. <code>BTC</code>, <code>ETH</code>):`, { parse_mode: 'HTML' });
  }

  async fastTrackTrade(ctx: Context, telegramId: bigint, side: 'long' | 'short', assetName: string) {
    const assetMeta = await this.hlInfo.findAsset(assetName);
    
    if (!assetMeta) {
      await ctx.reply(`❌ Could not find asset ${assetName} for fast-track!`);
      return;
    }

    const data = {
       side,
       asset: assetMeta.name,
       assetId: assetMeta.assetId,
       maxLeverage: assetMeta.maxLeverage,
       sizeUsdc: 10,       // Default Size
       leverage: 10,       // Default Lev
       tp: null,
       sl: null
    };

    await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
    await this.renderOrderPanel(ctx, data, false);
  }

  private async renderOrderPanel(ctx: Context, data: any, isEdit: boolean = true) {
    const summary = 
      `🦊 <b>FOXBLAZE ORDER SETUP</b> 🦊\n\n` +
      `🪙 Asset: <b>${data.asset}</b>\n` +
      `📊 Side: <b>${data.side.toUpperCase()}</b>\n` +
      `💰 Margin: <b>$${data.sizeUsdc}</b>\n` +
      `🚀 Leverage: <b>${data.leverage}x</b>\n` +
      `🎯 TP Price: <b>${data.tp || 'None'}</b>\n` +
      `🛡️ SL Price: <b>${data.sl || 'None'}</b>\n\n` +
      (data.inputMode ? `👉 <i>Awaiting custom ${data.inputMode.toUpperCase()} input...</i>` : `⚡ <i>Adjust parameters or Confirm Trade.</i>`);

    const markup = buildOrderPanelKeyboard(data);

    if (isEdit && ctx.callbackQuery?.message) {
       try {
          await ctx.editMessageText(summary, { parse_mode: 'HTML', reply_markup: markup });
       } catch (err: any) {
          if (!err.message?.includes('message is not modified')) {
             this.logger.error(`Render Order Panel Error: ${err.message}`);
          }
       }
    } else {
       await ctx.reply(summary, { parse_mode: 'HTML', reply_markup: markup });
    }
  }

  async handleTextMessage(ctx: Context, telegramId: bigint, text: string) {
    const session = await this.sessionService.get(telegramId);
    if (!session) return;

    const { state, data } = session;

    try {
      if (state === 'WAITING_ASSET_INPUT') {
          const assetName = text.trim().toUpperCase();
          const assetMeta = await this.hlInfo.findAsset(assetName);
          
          if (!assetMeta) {
            await ctx.reply(`❌ Asset <b>${assetName}</b> not found.\nEnter a valid ticker:`, { parse_mode: 'HTML' });
            return;
          }

          data.asset = assetMeta.name;
          data.assetId = assetMeta.assetId;
          data.maxLeverage = assetMeta.maxLeverage;
          data.sizeUsdc = 10;
          data.leverage = 10;
          data.tp = null;
          data.sl = null;
          
          await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
          await this.renderOrderPanel(ctx, data, false);
          return;
      }

      if (state === 'ORDER_SETUP_PANEL' && data.inputMode) {
          const val = parseFloat(text.trim());
          if (isNaN(val) || val <= 0) {
             await ctx.reply(`❌ Invalid number. Please enter a valid ${data.inputMode.toUpperCase()}.`);
             return;
          }

          // Xoá tin nhắn thừa của User bớt rác (Ngoại trừ nhóm cấm bot delete)
          try { await ctx.deleteMessage(); } catch(e) {}

          if (data.inputMode === 'size') data.sizeUsdc = val;
          if (data.inputMode === 'lev') {
             if (val > (data.maxLeverage || 20)) {
                await ctx.reply(`❌ Max leverage is ${data.maxLeverage}x.`);
                return;
             }
             data.leverage = val;
          }
          if (data.inputMode === 'tp') data.tp = val;
          if (data.inputMode === 'sl') data.sl = val;

          data.inputMode = null; // Exit input mode
          await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
          await this.renderOrderPanel(ctx, data, false); // Gửi Tin Nhắn Mới thay vì Edit vì User đã gửi chat chen ngang
          return;
      }
    } catch (e: any) {
      this.logger.error(`FSM Text Error: ${e.message}`);
    }
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
    // Luôn answer để client hết xoay icon Loading
    try { await ctx.answerCallbackQuery(); } catch (e) {}

    if (cbData.startsWith('trade_long_')) {
       await this.sessionService.clear(telegramId);
       const asset = cbData.replace('trade_long_', '');
       await this.fastTrackTrade(ctx, telegramId, 'long', asset);
       return true;
    }

    if (cbData.startsWith('trade_short_')) {
       await this.sessionService.clear(telegramId);
       const asset = cbData.replace('trade_short_', '');
       await this.fastTrackTrade(ctx, telegramId, 'short', asset);
       return true;
    }

    const session = await this.sessionService.get(telegramId);
    if (!session || session.state !== 'ORDER_SETUP_PANEL') return false;

    const { data } = session;

    // Presets
    if (cbData.startsWith('set_size_') && cbData !== 'set_size_custom') {
       data.sizeUsdc = parseInt(cbData.replace('set_size_', ''), 10);
       data.inputMode = null;
    } else if (cbData.startsWith('set_lev_') && cbData !== 'set_lev_custom') {
       const lev = parseInt(cbData.replace('set_lev_', ''), 10);
       if (lev <= (data.maxLeverage || 20)) data.leverage = lev;
       data.inputMode = null;
    }
    
    // Custom Modes
    if (['set_size_custom', 'set_lev_custom', 'set_tp_custom', 'set_sl_custom'].includes(cbData)) {
       data.inputMode = cbData.split('_')[1] as 'size' | 'lev' | 'tp' | 'sl';
    }

    if (cbData === 'cancel_trade') {
       await this.sessionService.clear(telegramId);
       await ctx.editMessageText(`❌ Trade setup cancelled by user.`);
       return true;
    }

    if (cbData === 'confirm_trade') {
       await ctx.editMessageText(`⏳ Verifying Risk Rules and executing on Hyperliquid...`);
       const user = await this.userService.findByTelegramId(telegramId);
       if (user) {
          try {
             await this.tradeService.queueOpenPosition({
               userId: user.id,
               asset: data.assetId!,
               isBuy: data.side === 'long',
               size: data.sizeUsdc!.toString(),
               leverage: data.leverage!,
               tp: data.tp?.toString(),
               sl: data.sl?.toString()
             });
             await ctx.editMessageText(`✅ Trade executed dynamically via L1 bridge!`);
          } catch (err: any) {
             await ctx.editMessageText(`<b>RISK SYSTEM ALERT:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
          }
       }
       await this.sessionService.clear(telegramId);
       return true;
    }

    await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
    await this.renderOrderPanel(ctx, data, true);
    return true;
  }
}
