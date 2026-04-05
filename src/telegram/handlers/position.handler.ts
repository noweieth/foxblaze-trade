import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { WalletService } from '../../wallet/wallet.service';
import { TradeService } from '../../trade/trade.service';
import { UserService } from '../../user/user.service';
import { CardRenderer, BRAND } from '../card-renderer.service';

@Injectable()
export class PositionHandler {
  private readonly logger = new Logger(PositionHandler.name);

  constructor(
    private readonly hlInfo: HlInfoService,
    private readonly walletService: WalletService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer
  ) {}

  register(bot: Bot) {
    bot.command('positions', async (ctx: Context) => this.handlePositions(ctx));
    bot.command('close', async (ctx: Context) => this.handleCloseCommand(ctx));
    bot.command('tp', async (ctx: Context) => this.handleSetTp(ctx));
    bot.command('sl', async (ctx: Context) => this.handleSetSl(ctx));
  }

  private async handlePositions(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply("❌ Please register first using /start.");

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet || !wallet.isHlRegistered) {
       return ctx.reply("❌ Your wallet is not connected to Hyperliquid. Please type /start.");
    }

    const waitMsg = await ctx.reply("⏳ Fetching active positions...");

    try {
      const positions = await this.hlInfo.getPositions(wallet.address);

      if (positions.length === 0) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, "ℹ️ You currently have no active positions.");
         return;
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      // Fetch candles for all positions concurrently (last 12 hours, 15m)
      const endTime = Date.now();
      const startTime = endTime - 12 * 60 * 60 * 1000;
      
      const positionsData = await Promise.all(positions.map(async (p) => {
        const uPnl = parseFloat(p.unrealizedPnl);
        const size = Math.abs(parseFloat(p.size));
        const entryPrice = parseFloat(p.entryPrice);
        const leverage = p.leverage;
        const initialMargin = (size * entryPrice) / leverage;
        const roe = initialMargin > 0 ? (uPnl / initialMargin) : 0;
        
        // Fetch historical
        const rawCandles = await this.hlInfo.getCandles(p.asset, '15m', startTime, endTime);
        const candles = rawCandles.map(c => parseFloat(c.c));
        
        return {
          asset: p.asset,
          side: p.side === 'long' ? 'LONG' : 'SHORT',
          uPnl: uPnl,
          roe: roe,
          entryPrice: entryPrice,
          leverage: leverage,
          sizeUsd: (size * entryPrice).toFixed(2),
          markPrice: candles[candles.length - 1]?.toFixed(4) || "0.00",
          candles: candles
        };
      }));

      // Tính tổng PnL 
      const totalPnl = positionsData.reduce((acc, p) => acc + p.uPnl, 0);
      const isProfit = totalPnl >= 0;
      const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;
      const headSign = isProfit ? '+' : '';
      const headPnlStr = `${headSign}$${Math.abs(totalPnl).toFixed(2)}`;

      // Setup layout Dimensions
      const headerH = 74;
      const blockH = 340; 
      const footerH = 36;
      
      const w = 720;
      // Height = Header + (Blocks) + Footer + padding
      const h = headerH + 20 + (positionsData.length * blockH) + footerH;

      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      // Header
      let cy = this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: 'A C T I V E   P O S I T I O N S',
        rightLabel: headPnlStr,
        rightLabelColor: pnlColor,
        rightSubtitle: 'TOTAL UNREALIZED PNL',
      });

      cy += 20;

      // Draw each position block
      for (const p of positionsData) {
        cy = this.cardRenderer.drawPositionChartBlock(ctx2d, {
          startY: cy,
          width: w,
          asset: p.asset,
          side: p.side,
          uPnl: p.uPnl,
          roe: p.roe,
          entryPrice: p.entryPrice,
          candles: p.candles,
          metrics: [
            { label: 'SIZE (USD)', val: `$${p.sizeUsd}` },
            { label: 'ENTRY', val: `$${p.entryPrice}` },
            { label: 'LEVERAGE', val: `${p.leverage}x` },
            { label: 'MARK', val: `$${p.markPrice}` }
          ]
        });
      }

      this.cardRenderer.drawFooter(ctx2d, w, h, `foxblaze.trade • Use /tp and /sl commands to manage positions`);

      const buffer = this.cardRenderer.toBuffer(canvas);

      // Build inline buttons grouped
      const kb = new InlineKeyboard();
      for (let i = 0; i < positions.length; i++) {
        kb.text(`✖️ ${positions[i].asset}`, `pos_close_${positions[i].asset}`);
        // Chỗ này chia 3 nút cắt lệnh 1 hàng cho k cồng kềnh
        if ((i + 1) % 3 === 0) kb.row(); 
      }
      if (positions.length % 3 !== 0) kb.row();

      if (positions.length > 1) {
        kb.text("❌ CLOSE ALL", "pos_close_ALL");
      }

      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `🦊 You have <b>${positions.length}</b> active positions. You can close them directly below, or use <code>/tp</code> and <code>/sl</code> to manage them.`,
        parse_mode: 'HTML',
        reply_markup: kb 
      });

    } catch (e: any) {
       this.logger.error(`Error fetching positions: ${e.message}`);
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error loading positions data.`);
    }
  }

  private async preparePosAction(ctx: Context, expectedArgs: number): Promise<{ user: any, wallet: any, asset: string, params: string[], pos: any, meta: any } | null> {
    const text = ctx.message?.text || '';
    const parts = text.split(' ').filter(Boolean);
    if (parts.length < expectedArgs) return null;

    if (!ctx.from) return null;
    const user = await this.userService.findByTelegramId(BigInt(ctx.from.id));
    if (!user) {
       await ctx.reply("❌ Please register first using /start.");
       return null;
    }

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet || !wallet.isHlRegistered) {
       await ctx.reply("❌ Your wallet is not connected to Hyperliquid. Please type /start.");
       return null;
    }

    const assetTicker = parts[1].toUpperCase();
    
    // Nếu là lệnh "/close all" sẽ được xử lý riêng bên ngoài chuẩn bị này
    if (assetTicker === 'ALL') {
       return { user, wallet, asset: 'ALL', params: parts, pos: null, meta: null };
    }

    const meta = await this.hlInfo.findAsset(assetTicker);
    if (!meta) {
       await ctx.reply(`❌ Could not find asset <b>${assetTicker}</b> on the exchange.`, { parse_mode: 'HTML' });
       return null;
    }

    const positions = await this.hlInfo.getPositions(wallet.address);
    const pos = positions.find(p => p.asset === assetTicker && parseFloat(p.size) !== 0);

    if (!pos) {
       await ctx.reply(`❌ You do NOT have any active position for <b>${assetTicker}</b>.`, { parse_mode: 'HTML' });
       return null;
    }

    return { user, wallet, asset: assetTicker, params: parts, pos, meta };
  }

  private async handleCloseCommand(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.trim() === '/close') {
       return ctx.reply("ℹ️ Usage: `/close <ticker>` or `/close all`\nExample: `/close BTC`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 2);
    if (!data) return;

    if (data.asset === 'ALL') {
       await ctx.reply("⏳ Liquidating ALL active positions...");
       const positions = await this.hlInfo.getPositions(data.wallet.address);
       const openPositions = positions.filter(p => parseFloat(p.size) !== 0);
       
       if (openPositions.length === 0) {
          return ctx.reply("ℹ️ You have no active positions to close.");
       }

       for (const p of openPositions) {
          const meta = await this.hlInfo.findAsset(p.asset);
          if (meta) {
             await this.tradeService.queueClosePosition({
                userId: data.user.id,
                asset: meta.assetId,
                size: p.size,
                currentSide: p.side
             });
          }
       }
       await ctx.reply(`✅ Queued ${openPositions.length} Market close orders...`);
       return;
    }

    // Đơn lẻ
    await ctx.reply(`⏳ Closing active position for <b>${data.asset}</b> (Size: ${data.pos.size})...`, { parse_mode: 'HTML' });
    
    await this.tradeService.queueClosePosition({
       userId: data.user.id,
       asset: data.meta.assetId,
       size: data.pos.size,
       currentSide: data.pos.side
    });
  }

  private async handleSetTp(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.split(' ').length < 3) {
       return ctx.reply("ℹ️ Usage: `/tp <ticker> <price>`\nExample: `/tp BTC 100000`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 3);
    if (!data) return;
    
    if (data.asset === 'ALL') {
       return ctx.reply("❌ This command does not support ALL.");
    }

    const price = parseFloat(data.params[2]);
    if (isNaN(price) || price <= 0) {
       return ctx.reply("❌ Invalid Take Profit price.");
    }

    await ctx.reply(`⏳ Setting Take Profit for <b>${data.asset}</b> at <b>$${price}</b>...`, { parse_mode: 'HTML' });

    await this.tradeService.queueSetTpSl({
       userId: data.user.id,
       asset: data.meta.assetId,
       isBuy: data.pos.side === 'long',
       size: data.pos.size,
       tp: price.toString()
    });
  }

  private async handleSetSl(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.split(' ').length < 3) {
       return ctx.reply("ℹ️ Usage: `/sl <ticker> <price>`\nExample: `/sl BTC 80000`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 3);
    if (!data) return;

    if (data.asset === 'ALL') {
       return ctx.reply("❌ This command does not support ALL.");
    }

    const price = parseFloat(data.params[2]);
    if (isNaN(price) || price <= 0) {
       return ctx.reply("❌ Invalid Stop Loss price.");
    }

    await ctx.reply(`⏳ Setting Stop Loss for <b>${data.asset}</b> at <b>$${price}</b>...`, { parse_mode: 'HTML' });

    await this.tradeService.queueSetTpSl({
       userId: data.user.id,
       asset: data.meta.assetId,
       isBuy: data.pos.side === 'long',
       size: data.pos.size,
       sl: price.toString()
    });
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
    if (cbData.startsWith('pos_close_')) {
      const asset = cbData.replace('pos_close_', '');
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      
      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) return true;

      await ctx.editMessageText(`⏳ Sending request to close <b>${asset}</b> position...`, { parse_mode: 'HTML' });
      
      const positions = await this.hlInfo.getPositions(wallet.address);
      const pos = positions.find(p => p.asset === asset);
      
      if (!pos) {
         await ctx.editMessageText(`❌ Error: Position for <b>${asset}</b> not found.`, { parse_mode: 'HTML' });
         return true;
      }
      
      const meta = await this.hlInfo.findAsset(asset);
      if (!meta) return true;

      // Đưa job Close Position vào BullMQ
      await this.tradeService.queueClosePosition({
         userId: user.id,
         asset: meta.assetId,
         size: pos.size,
         currentSide: pos.side
      });
      
      return true;
    }

    if (cbData.startsWith('pos_tp_')) {
      const asset = cbData.replace('pos_tp_', '');
      await ctx.answerCallbackQuery({ text: `Type: /tp ${asset} <price>`, show_alert: true });
      return true;
    }

    if (cbData.startsWith('pos_sl_')) {
      const asset = cbData.replace('pos_sl_', '');
      await ctx.answerCallbackQuery({ text: `Type: /sl ${asset} <price>`, show_alert: true });
      return true;
    }

    return false;
  }
}
