import { Injectable } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';

@Injectable()
export class HelpHandler {
  register(bot: Bot) {
    bot.command('help', async (ctx: Context) => this.handleHelp(ctx));
  }

  async handleHelp(ctx: Context) {
      const msg =
        `🦊 <b>FOXBLAZE — COMMAND GUIDE</b>\n\n` +
        `<b>🚀 TRADING</b>\n` +
        `/long — Open LONG position\n` +
        `/short — Open SHORT position\n` +
        `/cancel — Cancel active setup\n\n` +
        `<b>📊 MARKET</b>\n` +
        `/price <i>ticker</i> — Check price (e.g. /price BTC)\n` +
        `/markets — Top movers & 24h volume\n` +
        `/chart <i>ticker</i> — Interactive candlestick chart\n\n` +
        `<b>💼 MANAGEMENT</b>\n` +
        `/balance — Account overview\n` +
        `/positions — Active positions list\n` +
        `/orders — Pending orders list\n` +
        `/history — Trade history\n\n` +
        `<b>🔧 ADVANCED</b>\n` +
        `/close <i>ticker</i> — Close position (e.g. /close BTC)\n` +
        `/close all — Close all positions\n` +
        `/tp <i>ticker price</i> — Set Take Profit\n` +
        `/sl <i>ticker price</i> — Set Stop Loss\n\n` +
        `<b>💰 FUNDING</b>\n` +
        `/deposit — USDC (Arbitrum) deposit guide\n\n` +
        `<b>⭐ PREMIUM</b>\n` +
        `/premium — Activate & Manage VIP Features\n\n` +
        `⚡ <i>Powered by Hyperliquid L1 • Zero-Gas Deposit</i>`;

      const kb = new InlineKeyboard()
        .url("📖 Full Documentation", "https://docs.foxblaze.bot/en").row()
        .text("📈 Chart", "chart_BTC_15m")
        .text("💰 Balance", "nav_balance")
        .text("⬆️ Trade", "nav_long");

      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
  }
}
