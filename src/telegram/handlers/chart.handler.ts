import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InputFile, InlineKeyboard } from 'grammy';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { CardRenderer, BRAND } from '../card-renderer.service';

@Injectable()
export class ChartHandler {
  private readonly logger = new Logger(ChartHandler.name);

  constructor(
    private readonly hlInfo: HlInfoService,
    private readonly cardRenderer: CardRenderer,
  ) {}

  register(bot: Bot) {
    bot.command('chart', async (ctx: Context) => {
       const match = ctx.message?.text?.split(' ');
       if (!match || match.length < 2) {
         return ctx.reply("ℹ️ Usage: `/chart <ticker> [interval]`\nExample: `/chart BTC 15m`", { parse_mode: 'Markdown' });
       }
       const ticker = match[1].toUpperCase();
       let interval = match[2] ? match[2].toLowerCase() : '15m';
       await this.renderAndSendChart(ctx, ticker, interval, false);
    });
    bot.command('c', async (ctx: Context) => {
       const match = ctx.message?.text?.split(' ');
       if (!match || match.length < 2) {
         return ctx.reply("ℹ️ Usage: `/c <ticker> [interval]`\nExample: `/c BTC 15m`", { parse_mode: 'Markdown' });
       }
       const ticker = match[1].toUpperCase();
       let interval = match[2] ? match[2].toLowerCase() : '15m';
       await this.renderAndSendChart(ctx, ticker, interval, false);
    });
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string): Promise<boolean> {
     if (cbData.startsWith('chart_')) {
        const parts = cbData.split('_');
        if (parts.length >= 3) {
           const ticker = parts[1];
           const interval = parts[2];
           await this.renderAndSendChart(ctx, ticker, interval, true);
        }
        return true;
     }
     return false;
  }

  private async renderAndSendChart(ctx: Context, ticker: string, interval: string, isEdit: boolean) {
    const validIntervals = ['1m', '5m', '15m', '1h', '4h', '12h', '1d', '1w', '1M'];
    if (!validIntervals.includes(interval)) interval = '15m';

    let waitMsg: any = null;
    if (!isEdit) {
       waitMsg = await ctx.reply(`⏳ Loading chart data for <b>${ticker}</b> (${interval})...`, { parse_mode: 'HTML' });
    }

    try {
      const endTime = Date.now();
      let shiftMs = 24 * 60 * 60 * 1000; 
      if (interval === '1m') shiftMs = 2 * 60 * 60 * 1000; 
      if (interval === '5m') shiftMs = 8 * 60 * 60 * 1000; 
      if (interval === '15m') shiftMs = 24 * 60 * 60 * 1000; 
      if (interval === '1h') shiftMs = 4 * 24 * 60 * 60 * 1000; 
      if (interval === '4h') shiftMs = 14 * 24 * 60 * 60 * 1000;
      if (interval === '12h') shiftMs = 40 * 24 * 60 * 60 * 1000;
      if (interval === '1d') shiftMs = 90 * 24 * 60 * 60 * 1000; 
      if (interval === '1w') shiftMs = 365 * 24 * 60 * 60 * 1000; 
      if (interval === '1M') shiftMs = 3 * 365 * 24 * 60 * 60 * 1000; 
      
      const startTime = endTime - shiftMs;

      const [candles, markets] = await Promise.all([
          this.hlInfo.getCandles(ticker, interval as any, startTime, endTime),
          this.hlInfo.getMarketsData()
      ]);

      if (!candles || candles.length === 0) {
         if (isEdit) return;
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ No chart data found for ${ticker}.`);
         return;
      }

      const marketStats = markets.find(m => m.name === ticker);

      // ─── Card dimensions ───
      const logicalW = 720;
      const logicalH = 420;
      const PAD = 32;

      // Create branded card (2x resolution)
      const { canvas, ctx: ctx2d, w, h } = this.cardRenderer.createCard(logicalW, logicalH);

      // ─── Header ───
      let currentPx = '';
      let change = 0;
      if (marketStats) {
        currentPx = `$${parseFloat(marketStats.markPx).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        change = marketStats.percentChange;
      }

      const changeColor = change >= 0 ? BRAND.profitGreen : BRAND.lossRed;
      const changeSign = change >= 0 ? '+' : '';
      const changeStr = `${changeSign}${change.toFixed(2)}%`;

      this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: `${interval.toUpperCase()}  I N T E R V A L`,
        rightLabel: currentPx,
        rightLabelColor: BRAND.textWhite,
        rightSubtitle: `${ticker}/USD  ${changeStr}`,
      });

      // ─── Footer ───
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      this.cardRenderer.drawFooter(ctx2d, w, h, `${ticker}/USD • ${interval} • Updated ${timeStr}`);

      // ─── Chart area ───
      const chartLeft = PAD + 5;
      const chartRight = w - PAD - 45; // room for Y-axis labels
      const chartTop = 88;
      const chartBottom = h - 52;
      const chartWidth = chartRight - chartLeft;
      const chartHeight = chartBottom - chartTop;

      // Find min/max prices
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      for (const c of candles) {
        const hi = parseFloat(c.h);
        const lo = parseFloat(c.l);
        if (hi > maxPrice) maxPrice = hi;
        if (lo < minPrice) minPrice = lo;
      }
      const priceRange = maxPrice - minPrice;
      minPrice -= priceRange * 0.05;
      maxPrice += priceRange * 0.05;

      const getY = (price: number) => chartTop + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;

      // ─── Grid lines (neutral) ───
      const gridLines = 5;
      ctx2d.font = '9px "Arial"';
      ctx2d.textAlign = 'right';
      ctx2d.textBaseline = 'middle';

      for (let i = 0; i <= gridLines; i++) {
        const y = chartTop + (i * chartHeight) / gridLines;
        const priceLabel = maxPrice - (i * (maxPrice - minPrice)) / gridLines;

        // Grid line — very subtle
        ctx2d.beginPath();
        ctx2d.strokeStyle = BRAND.gridLine;
        ctx2d.lineWidth = 1;
        ctx2d.moveTo(chartLeft, y);
        ctx2d.lineTo(chartRight, y);
        ctx2d.stroke();

        // Y-axis label
        ctx2d.fillStyle = BRAND.textMuted;
        ctx2d.fillText(priceLabel.toFixed(1), w - PAD + 2, y);
      }

      // ─── X-axis time labels ───
      const candleWidth = chartWidth / candles.length;
      const xLabelsCount = 6;
      const stepX = Math.floor(candles.length / xLabelsCount);

      ctx2d.textAlign = 'center';
      ctx2d.fillStyle = BRAND.textMuted;
      ctx2d.font = '8px "Arial"';

      for (let i = 0; i < candles.length; i += stepX) {
        const x = chartLeft + i * candleWidth + candleWidth / 2;
        const date = new Date(candles[i].t);
        const tStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        ctx2d.fillText(tStr, x, chartBottom + 12);
      }

      // ─── Candlesticks ───
      const bodyWidth = Math.max(1, candleWidth * 0.7);

      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const o = parseFloat(c.o);
        const hi = parseFloat(c.h);
        const lo = parseFloat(c.l);
        const cl = parseFloat(c.c);

        const x = chartLeft + i * candleWidth + candleWidth / 2;
        const yOpen = getY(o);
        const yClose = getY(cl);
        const yHigh = getY(hi);
        const yLow = getY(lo);

        const isBull = cl >= o;
        const color = isBull ? BRAND.candleGreen : BRAND.candleRed;

        ctx2d.fillStyle = color;
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = Math.max(1, candleWidth * 0.15);

        // Wick
        ctx2d.beginPath();
        ctx2d.moveTo(x, yHigh);
        ctx2d.lineTo(x, yLow);
        ctx2d.stroke();

        // Body
        const rectY = Math.min(yOpen, yClose);
        const rectH = Math.max(1.5, Math.abs(yClose - yOpen));
        ctx2d.fillRect(x - bodyWidth / 2, rectY, bodyWidth, rectH);
      }

      // ─── Current price line (dashed) ───
      if (marketStats) {
        const curPx = parseFloat(marketStats.markPx);
        const curY = getY(curPx);
        ctx2d.beginPath();
        ctx2d.setLineDash([4, 3]);
        ctx2d.strokeStyle = change >= 0 ? BRAND.profitGreen + '80' : BRAND.lossRed + '80';
        ctx2d.lineWidth = 1;
        ctx2d.moveTo(chartLeft, curY);
        ctx2d.lineTo(chartRight, curY);
        ctx2d.stroke();
        ctx2d.setLineDash([]);

        // Price tag on right
        const tagW = 54;
        const tagH = 16;
        const tagColor = change >= 0 ? BRAND.profitGreen : BRAND.lossRed;
        ctx2d.fillStyle = tagColor;
        ctx2d.fillRect(chartRight + 2, curY - tagH / 2, tagW, tagH);
        ctx2d.fillStyle = '#000000';
        ctx2d.font = 'bold 8px "Arial"';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(curPx.toFixed(1), chartRight + 2 + tagW / 2, curY);
      }

      const buffer = this.cardRenderer.toBuffer(canvas);

      // ─── Keyboard ───
      const kb = new InlineKeyboard();
      kb.text('1m', `chart_${ticker}_1m`).text('5m', `chart_${ticker}_5m`).text('15m', `chart_${ticker}_15m`)
        .text('1h', `chart_${ticker}_1h`).text('4h', `chart_${ticker}_4h`).text('1d', `chart_${ticker}_1d`).row();
      kb.text(`⬇️ Short ${ticker}`, `trade_short_${ticker}`).text(`⬆️ Long ${ticker}`, `trade_long_${ticker}`);

      if (isEdit) {
         await ctx.editMessageMedia(
             { type: 'photo', media: new InputFile(buffer) },
             { reply_markup: kb }
         );
      } else {
         await ctx.replyWithPhoto(new InputFile(buffer), { reply_markup: kb });
         await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);
      }

    } catch (e: any) {
      this.logger.error(`Chart Error: ${e.message}`);
      if (!isEdit && waitMsg) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error rendering chart: ${e.message}`);
      }
    }
  }
}
