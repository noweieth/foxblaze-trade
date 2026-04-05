import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context } from 'grammy';
import { UserService } from '../../user/user.service';
import { SessionService } from '../../session/session.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { TradeService } from '../../trade/trade.service';
import { buildLeverageKeyboard, buildConfirmKeyboard } from '../keyboards/inline.keyboard';

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
    
    // Khởi tạo quy trình State Machine (FSM)
    await this.sessionService.set(telegramId, {
      state: 'AWAITING_ASSET',
      data: { side }
    });

    await ctx.reply(`🦊 Setting up a <b>${side.toUpperCase()}</b> position.\nEnter the Asset Ticker (e.g. <code>BTC</code>, <code>ETH</code>):`, { parse_mode: 'HTML' });
  }

  // Phương thức Fast-track từ Inline Keyboard bấm ở Chart
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
       maxLeverage: assetMeta.maxLeverage
    };

    // Đẩy thẳng vào Step AWAITING_SIZE
    await this.sessionService.set(telegramId, { state: 'AWAITING_SIZE', data });
    await ctx.reply(`✅ Asset: <b>${assetMeta.name}</b>\n⚖️ Side: <b>${side.toUpperCase()}</b>\n⚖️ Max Leverage: <b>${assetMeta.maxLeverage}x</b>\n\nEnter your Margin size in USDC (Min 1 USDC):`, { parse_mode: 'HTML' });
  }

  // Phương thức Intercept thông điệp Text thông thường của người đang bị kẹt trong FSM
  async handleTextMessage(ctx: Context, telegramId: bigint, text: string) {
    const session = await this.sessionService.get(telegramId);
    if (!session) return; // Không nằm trong chuỗi FSM

    const { state, data } = session;

    try {
      switch (state) {
        case 'AWAITING_ASSET': {
          const assetName = text.trim().toUpperCase();
          const assetMeta = await this.hlInfo.findAsset(assetName);
          
          if (!assetMeta) {
            await ctx.reply(`❌ Could not find asset <b>${assetName}</b> on Hyperliquid!\nPlease check and enter a valid ticker:`, { parse_mode: 'HTML' });
            return;
          }

          data.asset = assetMeta.name;
          data.assetId = assetMeta.assetId;
          data.maxLeverage = assetMeta.maxLeverage;
          
          await this.sessionService.set(telegramId, { state: 'AWAITING_SIZE', data });
          await ctx.reply(`✅ Asset: <b>${assetMeta.name}</b>\n⚖️ Max Leverage: <b>${assetMeta.maxLeverage}x</b>\n\nEnter your Margin size in USDC (Min 1 USDC):`, { parse_mode: 'HTML' });
          break;
        }

        case 'AWAITING_SIZE': {
          const sizeMs = parseFloat(text.trim());
          if (isNaN(sizeMs) || sizeMs < 1) {
            await ctx.reply(`❌ Invalid Size. Please enter a valid margin size (Min 1 USDC):`);
            return;
          }
          
          data.sizeUsdc = sizeMs;
          
          await this.sessionService.set(telegramId, { state: 'AWAITING_LEVERAGE', data });
          await ctx.reply(
            `💰 Margin Size: <b>$${sizeMs}</b>\n⚡ Select leverage via buttons below or type a custom number:`,
            { 
              parse_mode: 'HTML', 
              reply_markup: buildLeverageKeyboard(data.maxLeverage || 20) 
            }
          );
          break;
        }

        case 'AWAITING_LEVERAGE': {
          const lev = parseInt(text.trim(), 10);
          if (isNaN(lev) || lev < 1 || (data.maxLeverage && lev > data.maxLeverage)) {
            await ctx.reply(`❌ Invalid leverage! Max leverage for this asset is ${data.maxLeverage}x.\nPlease enter leverage again:`);
            return;
          }
          
          data.leverage = lev;
          
          await this.sessionService.set(telegramId, { state: 'AWAITING_TP', data });
          await ctx.reply(`🎯 Selected leverage: <b>${lev}x</b>\n\nEnter Take Profit price or type <code>/skip</code> to skip:`, { parse_mode: 'HTML' });
          break;
        }

        case 'AWAITING_TP': {
          if (text.trim() !== '/skip') {
             const tp = parseFloat(text.trim());
             if (isNaN(tp) || tp <= 0) {
               await ctx.reply(`❌ Take Profit must be a positive number. Try again or type <code>/skip</code>:`, { parse_mode: 'HTML' });
               return;
             }
             data.tp = tp;
          }
          
          await this.sessionService.set(telegramId, { state: 'AWAITING_SL', data });
          await ctx.reply(`🛡️ Enter Stop Loss price or type <code>/skip</code> to skip:`, { parse_mode: 'HTML' });
          break;
        }

        case 'AWAITING_SL': {
          if (text.trim() !== '/skip') {
             const sl = parseFloat(text.trim());
             if (isNaN(sl) || sl <= 0) {
               await ctx.reply(`❌ Stop Loss must be a positive number. Try again or type <code>/skip</code>:`, { parse_mode: 'HTML' });
               return;
             }
             data.sl = sl;
          }
          
          await this.sessionService.set(telegramId, { state: 'AWAITING_CONFIRM', data });
          
          const summary = 
            `📝 <b>TRADE CONFIRMATION</b>\n\n` +
            `🪙 Asset: <b>${data.asset}</b>\n` +
            `📊 Side: <b>${data.side?.toUpperCase()}</b>\n` +
            `💰 Margin: <b>$${data.sizeUsdc}</b>\n` +
            `🚀 Leverage: <b>${data.leverage}x</b>\n` +
            `🎯 TP Price: <b>${data.tp || 'None'}</b>\n` +
            `🛡️ SL Price: <b>${data.sl || 'None'}</b>\n\n` +
            `🔥 Approve this trade execution?`;

          await ctx.reply(summary, { parse_mode: 'HTML', reply_markup: buildConfirmKeyboard() });
          break;
        }

        case 'AWAITING_CONFIRM':
          await ctx.reply(`⚠️ Please use the Inline buttons above to Confirm or Cancel the trade. Type /cancel to abort immediately.`);
          break;
      }
    } catch (e: any) {
      await ctx.reply(`❌ Error syncing FSM State.`);
      this.logger.error(`FSM Text Error: ${e.message}`);
    }
  }

  // Interceptor xử lý riêng mảng nút bấm của chu trình Trade
  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
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
    if (!session) return false;

    const { state, data } = session;

    if (state === 'AWAITING_LEVERAGE' && cbData.startsWith('lev_')) {
      if (cbData === 'lev_custom') {
        await ctx.reply(`Please enter a custom Leverage (Max for this asset is ${data.maxLeverage}x):`);
        return true;
      }
      
      const lev = parseInt(cbData.replace('lev_', ''), 10);
      data.leverage = lev;
      await this.sessionService.set(telegramId, { state: 'AWAITING_TP', data });
      
      await ctx.editMessageText(
        `💰 Margin Size: <b>$${data.sizeUsdc}</b>\n` +
        `🎯 Selected Leverage: <b>${lev}x</b>\n\n` +
        `Next, enter Take Profit price or type <code>/skip</code> to skip:`, 
        { parse_mode: 'HTML' }
      );
      return true;
    }

    if (state === 'AWAITING_CONFIRM') {
      if (cbData === 'cancel_trade') {
         await this.sessionService.clear(telegramId);
         await ctx.editMessageText(`❌ Trade setup cancelled by user.`);
         return true;
      }

      if (cbData === 'confirm_trade') {
         await ctx.editMessageText(`⏳ Verifying Risk Rules and Account Health...`);
         
         const user = await this.userService.findByTelegramId(telegramId);
         if (user) {
            try {
               // Queue lệnh qua TradeService Background (Sẽ ném lỗi nếu vi phạm Risk Rules)
               await this.tradeService.queueOpenPosition({
                 userId: user.id,
                 asset: data.assetId!,
                 isBuy: data.side === 'long',
                 size: data.sizeUsdc!.toString(),
                 leverage: data.leverage!,
                 tp: data.tp?.toString(),
                 sl: data.sl?.toString()
               });
               
               await ctx.editMessageText(`✅ Trade approved! Queueing for on-chain execution via L1 bridge...`);
            } catch (err: any) {
               // Bắt trọn thông điệp lỗi Risk (bắt đầu bằng ký tự 🚫 hoặc ❌)
               await ctx.editMessageText(`<b>RISK SYSTEM ALERT:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
            }
         }
         
         // Thanh trừng session vì đã xử lý xong
         await this.sessionService.clear(telegramId);
         return true;
      }
    }

    return false; // Not part of FSM logic
  }
}
