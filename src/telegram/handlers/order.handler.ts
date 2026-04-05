import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { WalletService } from '../../wallet/wallet.service';
import { TradeService } from '../../trade/trade.service';
import { UserService } from '../../user/user.service';
import { CardRenderer, BRAND } from '../card-renderer.service';

@Injectable()
export class OrderHandler {
  private readonly logger = new Logger(OrderHandler.name);

  constructor(
    private readonly hlInfo: HlInfoService,
    private readonly walletService: WalletService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer
  ) {}

  register(bot: Bot) {
    bot.command('orders', async (ctx: Context) => this.handleOrders(ctx));
  }

  private async handleOrders(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply("❌ Please register first using /start.");

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet || !wallet.isHlRegistered) return ctx.reply("❌ Your wallet is not connected to Hyperliquid.");

    const waitMsg = await ctx.reply("⏳ Fetching open orders...");

    try {
      const orders = await this.hlInfo.getOpenOrders(wallet.address);

      if (orders.length === 0) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, "ℹ️ You currently have no open orders.");
         return;
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      const headerH = 74;
      const tableHeaderH = 36;
      const rowH = 52;
      const footerH = 36;
      
      const PAD = 32;
      const w = 720;
      const h = headerH + 20 + tableHeaderH + (orders.length * rowH) + 20 + footerH;

      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      let cy = this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: 'P E N D I N G   O R D E R S',
        rightLabel: `${orders.length} Active`,
        rightLabelColor: BRAND.textWhite,
        rightSubtitle: 'OPEN ORDERS QUEUE',
      });

      cy += 20;

      const rows = orders.map(o => {
        const isLong = o.side.toLowerCase() === 'b' || o.side.toLowerCase() === 'long';
        const sideColor = isLong ? BRAND.profitSoft : BRAND.lossSoft;
        const sideColorStr = isLong ? '#00E676' : '#FF4444';
        const sideText = isLong ? 'LONG' : 'SHORT';
        
        const price = parseFloat(o.price);

        return {
          values: [
            o.asset,
            '', // badge reserved
            o.orderType || 'Limit',
            o.size,
            `$${price >= 1 ? price.toFixed(2) : price.toFixed(4)}`
          ],
          colors: [
            BRAND.textWhite,
            '',
            BRAND.textLight,
            BRAND.textWhite,
            BRAND.textWhite
          ],
          badge: {
            colIndex: 1,
            text: sideText,
            color: sideColorStr,
            bgAlpha: 0.08,
            borderAlpha: 0.25
          }
        };
      });

      this.cardRenderer.drawTable(ctx2d, {
        headers: [
          { text: 'SYMBOL', pct: 0.20, align: 'left' },
          { text: 'SIDE', pct: 0.15, align: 'center' },
          { text: 'TYPE', pct: 0.20, align: 'right' },
          { text: 'SIZE', pct: 0.20, align: 'right' },
          { text: 'TRIGGER PRICE', pct: 0.25, align: 'right' }
        ],
        rows,
        startY: cy,
        tableWidth: w - 2 * PAD,
      });

      this.cardRenderer.drawFooter(ctx2d, w, h, `foxblaze.trade // Tap button below to cancel orders`);

      const buffer = this.cardRenderer.toBuffer(canvas);

      // Create grouped inline keyboard
      const keyboard = new InlineKeyboard();
      orders.forEach((o, index) => {
        const typeStr = o.orderType || 'Limit';
        const isLong = o.side.toLowerCase() === 'b' || o.side.toLowerCase() === 'long';
        const sideStr = isLong ? 'L' : 'S';
        keyboard.text(`❌ Cancel: ${o.asset} ${typeStr} (${sideStr})`, `order_cancel_${o.asset}_${o.orderId}`);
        // 2 buttons per row
        if (index % 2 !== 0) keyboard.row();
      });

      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `⏳ <b>${orders.length} Active Pending Orders</b>`,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

    } catch (e: any) {
       this.logger.error(`Error fetching open orders: ${e.message}`);
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error loading orders data.`);
    }
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
    if (cbData.startsWith('order_cancel_')) {
      const parts = cbData.replace('order_cancel_', '').split('_');
      const asset = parts[0];
      const orderId = parseInt(parts[1], 10);

      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) return true;

      const meta = await this.hlInfo.findAsset(asset);
      if (!meta) return true;

      await ctx.editMessageText(`⏳ Cancelling order #${orderId}...`);

      try {
        await this.tradeService.queueCancelOrder({
          userId: user.id,
          asset: meta.assetId,
          orderId
        });
        await ctx.editMessageText(`✅ Cancel request for Order #${orderId} (<b>${asset}</b>) has been queued.`, { parse_mode: 'HTML' });
      } catch (e: any) {
        await ctx.editMessageText(`❌ Error cancelling order: ${e.message}`);
      }
      return true;
    }

    return false;
  }
}
