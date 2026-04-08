import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InputFile } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../../user/user.service';
import { CardRenderer, BRAND } from '../card-renderer.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';

@Injectable()
export class HistoryHandler {
  private readonly logger = new Logger(HistoryHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer,
    private readonly hlInfo: HlInfoService
  ) {}

  register(bot: Bot) {
    bot.command('history', async (ctx: Context) => this.handleHistory(ctx));
  }

  private async handleHistory(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply("❌ Please register first using /start.");

    const waitMsg = await ctx.reply("⏳ Fetching your trade history...");

    try {
      const records = await this.prisma.trade.findMany({
        where: {
           userId: user.id,
           status: { in: ['CLOSED', 'FAILED'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      if (records.length === 0) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, "📭 You don't have any closed or failed trades yet.");
         return;
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      const allAssets = await this.hlInfo.getAllAssets();

      const histories = records.map((h: any) => {
        const dateStr = h.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
        // Omit seconds for better UX, format YYYY-MM-DD HH:mm
        const dateClean = dateStr.replace(/:\d{2}$/, ''); 
        
        let assetName = h.asset;
        if (!isNaN(parseInt(h.asset))) {
           const assetMeta = allAssets.find(a => a.assetId === parseInt(h.asset));
           if (assetMeta) assetName = assetMeta.name;
        }

        return {
          asset: assetName,
          side: h.side,
          leverage: h.leverage,
          status: h.status,
          entry: h.entryPrice || 0,
          exit: h.closePrice || undefined,
          size: h.size,
          pnl: h.pnl || 0,
          date: dateClean
        };
      });

      const totalPnl = histories.reduce((acc: number, h: any) => acc + (h.pnl || 0), 0);
      const isProfit = totalPnl >= 0;
      const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;

      // Setup layout Dimensions
      const headerH = 74;
      const rowH = 68;
      const footerH = 36;
      
      const w = 720;
      const h = headerH + 20 + (histories.length * rowH) + 10 + footerH;

      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      // Header
      let cy = this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: 'T R A D I N G   H I S T O R Y',
        rightLabel: `${isProfit ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}`,
        rightLabelColor: pnlColor,
        rightSubtitle: 'REALIZED PNL (RECENT)',
      });

      cy += 20;

      // Draw History List
      cy = this.cardRenderer.drawHistoryList(ctx2d, {
        startY: cy,
        width: w,
        histories: histories
      });

      this.cardRenderer.drawFooter(ctx2d, w, h, `Displaying latest 10 trades // FoxBlaze AI`);

      const buffer = this.cardRenderer.toBuffer(canvas);

      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `📜 <b>Trade History:</b> Displaying your ${histories.length} most recent trades.`,
        parse_mode: 'HTML'
      });

    } catch (e: any) {
       this.logger.error(`Error fetching history: ${e.message}`);
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error loading trade history.`);
    }
  }
}
