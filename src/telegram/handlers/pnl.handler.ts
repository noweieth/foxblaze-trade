import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../../user/user.service';
import { CardRenderer, BRAND } from '../card-renderer.service';

@Injectable()
export class PnlHandler {
  private readonly logger = new Logger(PnlHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer
  ) {}

  register(bot: Bot) {
    bot.command('pnl', async (ctx: Context) => this.handlePnl(ctx));
  }

  private async handlePnl(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply("❌ Please register first using /start.");

    const waitMsg = await ctx.reply("⏳ Calculating PnL shape (7D)...");

    try {
      // Fetch all closed trades
      // Doing simple sequential accumulation instead of GROUP BY date for now
      const records = await this.prisma.trade.findMany({
        where: {
           userId: user.id,
           status: { in: ['CLOSED'] }
        },
        orderBy: { closedAt: 'asc' }, // Oldest to newest
        take: 50 // Limit 50 recent trades
      });

      if (records.length === 0) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, "📭 You don't have enough closed trades to calculate PnL yet.");
         return;
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      // Build cumulative PnL array
      let currentSum = 0;
      const pnlData = [0]; // Start at 0

      for (const r of records) {
        currentSum += (r.pnl || 0);
        pnlData.push(currentSum);
      }

      const totalPnl = currentSum;
      const isProfit = totalPnl >= 0;
      const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;

      // Draw Card
      const w = 800;
      const h = 460;
      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      const sign = isProfit ? '+' : '-';
      let cy = this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: 'P N L   A N A L Y S I S',
        rightLabel: `${sign}$${Math.abs(totalPnl).toFixed(2)}`,
        rightLabelColor: pnlColor,
        rightSubtitle: 'CUMULATIVE REALIZED PNL',
      });

      cy += 20;

      // Draw chart
      this.cardRenderer.drawPnlChart(ctx2d, {
        startY: cy,
        width: w,
        height: h,
        pnlData: pnlData
      });

      this.cardRenderer.drawFooter(ctx2d, w, h, `foxblaze.trade // Showing PnL of the last 50 closed trades`);

      const buffer = this.cardRenderer.toBuffer(canvas);

      // Timeframe switcher keyboard (Mocking logic for now)
      const keyboard = new InlineKeyboard()
         .text("1D", "pnl_1d")
         .text("7D (Current)", "pnl_7d")
         .text("30D", "pnl_30d")
         .text("ALL", "pnl_all");

      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `🔥 <b>Profit Analysis (Closed Positions)</b>\nYour net profit/loss based on trade history.`,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

    } catch (e: any) {
       this.logger.error(`Error fetching pnl: ${e.message}`);
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error loading PnL data.`);
    }
  }
}
