import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context } from 'grammy';
import { HlInfoService } from '../../hyperliquid/hl-info.service';

@Injectable()
export class InfoHandler {
  private readonly logger = new Logger(InfoHandler.name);

  constructor(private readonly hlInfo: HlInfoService) {}

  register(bot: Bot) {
    bot.command('price', async (ctx: Context) => this.handlePrice(ctx));
    bot.command('markets', async (ctx: Context) => this.handleMarkets(ctx));
  }

  private async handlePrice(ctx: Context) {
    const match = ctx.message?.text?.split(' ');
    if (!match || match.length < 2) {
      return ctx.reply("ℹ️ Usage: `/price <ticker>` (e.g., `/price BTC`)", { parse_mode: 'Markdown' });
    }
    
    const ticker = match[1].toUpperCase();
    const waitMsg = await ctx.reply("⏳ Fetching Oracle data...");

    try {
      const markets = await this.hlInfo.getMarketsData();
      const asset = markets.find(m => m.name === ticker);
      
      if (!asset) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Could not find data for ${ticker}.`);
         return;
      }

      const pChange = asset.percentChange.toFixed(2);
      const icon = asset.percentChange >= 0 ? '📈' : '📉';
      
      const msg = `⚡ <b>HYPERLIQUID L1 MARK PRICE</b>\n\n` +
                  `🪙 <b>${ticker}</b>: $${parseFloat(asset.markPx).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}\n` +
                  `📊 24h Change: ${icon} <b>${pChange}%</b>\n` +
                  `💸 24h Vol: $${(parseFloat(asset.dayNtlVlm) / 1000000).toFixed(2)}M`;

      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, msg, { parse_mode: 'HTML' });
    } catch (e: any) {
      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error fetching price data: ${e.message}`);
    }
  }

  private async handleMarkets(ctx: Context) {
    const waitMsg = await ctx.reply("⏳ Scanning Hyperliquid Market Radar...");
    try {
       const markets = await this.hlInfo.getMarketsData();
       
       const topGainers = [...markets].sort((a, b) => b.percentChange - a.percentChange).slice(0, 5);
       
       let msg = `🌊 <b>MARKET RADAR</b>\n\n`;
       msg += `🚀 <b>TOP 5 GAINERS (24H)</b>:\n`;
       topGainers.forEach((m, idx) => {
          msg += `${idx + 1}. <b>${m.name}</b>: $${parseFloat(m.markPx).toLocaleString()} (+${m.percentChange.toFixed(2)}%)\n`;
       });

       const topVol = [...markets].sort((a, b) => parseFloat(b.dayNtlVlm) - parseFloat(a.dayNtlVlm)).slice(0, 5);
       msg += `\n🔥🔥 <b>TOP 5 VOLUME (24H)</b>:\n`;
       topVol.forEach((m, idx) => {
          msg += `${idx + 1}. <b>${m.name}</b>: $${(parseFloat(m.dayNtlVlm) / 1000000).toFixed(2)}M\n`;
       });

       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, msg, { parse_mode: 'HTML' });
    } catch (e: any) {
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error fetching market data: ${e.message}`);
    }
  }
}
