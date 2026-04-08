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
    
    // Require Asset input first to establish context
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
       limitPrice: null,
       tp: null,
       sl: null
    };

    await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
    await this.renderOrderPanel(ctx, data, telegramId, false);
  }

  private async renderOrderPanel(ctx: Context, data: any, telegramId: bigint, isEdit: boolean = true) {
    const summary = 
      `🦊 <b>FOXBLAZE ORDER SETUP</b> 🦊\n\n` +
      `🪙 Asset: <b>${data.asset}</b>\n` +
      `📊 Side: <b>${data.side.toUpperCase()}</b>\n` +
      `💰 Margin: <b>$${data.sizeUsdc}</b>\n` +
      `🚀 Leverage: <b>${data.leverage}x</b>\n` +
      `🚪 Entry: <b>${data.limitPrice ? `Limit @ $${data.limitPrice}` : 'Market'}</b>\n` +
      `🎯 TP Price: <b>${data.tp || 'None'}</b>\n` +
      `🛡️ SL Price: <b>${data.sl || 'None'}</b>\n\n` +
      `⚡ <i>Adjust parameters or Confirm Trade.</i>`;

    const markup = buildOrderPanelKeyboard(data);

    if (isEdit) {
       try {
          if (data.panelMsgId) {
             await ctx.api.editMessageText(ctx.chat!.id, data.panelMsgId, summary, { parse_mode: 'HTML', reply_markup: markup });
          } else if (ctx.callbackQuery?.message) {
             await ctx.editMessageText(summary, { parse_mode: 'HTML', reply_markup: markup });
             data.panelMsgId = ctx.callbackQuery.message.message_id;
          }
       } catch (err: any) {
          if (!err.message?.includes('message is not modified')) {
             this.logger.error(`Render Order Panel Error: ${err.message}`);
          }
       }
    } else {
       const sent = await ctx.reply(summary, { parse_mode: 'HTML', reply_markup: markup });
       data.panelMsgId = sent.message_id;
    }
    
    await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
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
          data.limitPrice = null;
          data.tp = null;
          data.sl = null;
          
          await this.renderOrderPanel(ctx, data, telegramId, false);
          return;
      }

      if (state === 'ORDER_SETUP_PANEL' && data.inputMode) {
          const val = parseFloat(text.trim());
          
          // Delete user's input message 
          try { await ctx.deleteMessage(); } catch(e) {}
          
          // Delete prompt message "Please enter..."
          if (data.promptMsgId) {
             try { await ctx.api.deleteMessage(ctx.chat!.id, data.promptMsgId); } catch(e) {}
             data.promptMsgId = undefined;
          }

          if (isNaN(val) || val <= 0) {
             const errPrompt = await ctx.reply(`❌ Invalid number. Please enter a valid ${data.inputMode.toUpperCase()}:`, {
                reply_markup: { force_reply: true }
             });
             data.promptMsgId = errPrompt.message_id;
             await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
             return;
          }

          if (data.inputMode === 'size') data.sizeUsdc = val;
          if (data.inputMode === 'lev') {
             if (val > (data.maxLeverage || 20)) {
                const errPrompt = await ctx.reply(`❌ Max leverage is ${data.maxLeverage}x. Enter again:`, {
                   reply_markup: { force_reply: true }
                });
                data.promptMsgId = errPrompt.message_id;
                await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
                return;
             }
             data.leverage = val;
          }
          if (data.inputMode === 'entry') data.limitPrice = val;
          if (data.inputMode === 'tp') data.tp = val;
          if (data.inputMode === 'sl') data.sl = val;

          data.inputMode = null; // Clean mode
          await this.renderOrderPanel(ctx, data, telegramId, true); // Update panel
          return;
      }
    } catch (e: any) {
      this.logger.error(`FSM Text Error: ${e.message}`);
    }
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
    // Always answer to stop loading spinner on client
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

    // Check if the callback belongs to the order panel
    const orderPanelPrefixes = [
      'set_size_', 'set_lev_', 'set_entry_market', 'set_entry_custom', 'set_tp_custom', 'set_sl_custom', 'cancel_trade', 'confirm_trade'
    ];
    if (!orderPanelPrefixes.some(prefix => cbData.startsWith(prefix))) {
       return false; // Yield cbData to other handlers (like PositionHandler)
    }

    const { data } = session;

    if (ctx.callbackQuery?.message) {
        data.panelMsgId = ctx.callbackQuery.message.message_id;
    }

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
    if (cbData === 'set_entry_market') {
       data.limitPrice = null;
       data.inputMode = null;
    }

    if (['set_size_custom', 'set_lev_custom', 'set_entry_custom', 'set_tp_custom', 'set_sl_custom'].includes(cbData)) {
       const mode = cbData.split('_')[1] as 'size' | 'lev' | 'entry' | 'tp' | 'sl';
       data.inputMode = mode;
       
       // Force Reply Prompt UI so user knows they need to input, not a hang
       const promptMsg = await ctx.reply(`👉 Please enter custom <b>${mode.toUpperCase()}</b> value in the chat:`, {
          parse_mode: 'HTML',
          reply_markup: { force_reply: true, selective: true }
       });
       
       data.promptMsgId = promptMsg.message_id;
       await this.sessionService.set(telegramId, { state: 'ORDER_SETUP_PANEL', data });
       return true;
    }

    if (cbData === 'cancel_trade') {
       await this.sessionService.clear(telegramId);
       if (data.promptMsgId) {
           try { await ctx.api.deleteMessage(ctx.chat!.id, data.promptMsgId); } catch(e) {}
       }
       if (data.panelMsgId) {
           try { await ctx.api.editMessageText(ctx.chat!.id, data.panelMsgId, `❌ Trade setup cancelled by user.`); } catch(e) {}
       } else if (ctx.callbackQuery?.message) {
           try { await ctx.editMessageText(`❌ Trade setup cancelled by user.`); } catch(e) {}
       }
       return true;
    }

    if (cbData === 'confirm_trade') {
       const updateMsg = async (text: string) => {
          if (data.panelMsgId) {
             try { await ctx.api.editMessageText(ctx.chat!.id, data.panelMsgId, text, { parse_mode: 'HTML' }); } catch(e) {}
          } else if (ctx.callbackQuery?.message) {
             try { await ctx.editMessageText(text, { parse_mode: 'HTML' }); } catch(e) {}
          }
       };

       await updateMsg(`⏳ Verifying Risk Rules and executing on Hyperliquid...`);
       const user = await this.userService.findByTelegramId(telegramId);
       if (user) {
          try {
             await this.tradeService.queueOpenPosition({
               userId: user.id,
               asset: data.assetId!,
               isBuy: data.side === 'long',
               size: data.sizeUsdc!.toString(),
               leverage: data.leverage!,
               limitPrice: data.limitPrice?.toString(),
               tp: data.tp?.toString(),
               sl: data.sl?.toString()
             });
             await updateMsg(`✅ Trade executed dynamically via L1 bridge!`);
          } catch (err: any) {
             await updateMsg(`<b>RISK SYSTEM ALERT:</b>\n\n${err.message}`);
          }
       }
       
       if (data.promptMsgId) {
           try { await ctx.api.deleteMessage(ctx.chat!.id, data.promptMsgId); } catch(e) {}
       }
       await this.sessionService.clear(telegramId);
       return true;
    }

    await this.renderOrderPanel(ctx, data, telegramId, true);
    return true;
  }
}
