import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InputFile, InlineKeyboard } from 'grammy';
import { UserService } from '../../user/user.service';
import { WalletService } from '../../wallet/wallet.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { CardRenderer, BRAND } from '../card-renderer.service';

@Injectable()
export class BalanceHandler {
  private readonly logger = new Logger(BalanceHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly hlInfo: HlInfoService,
    private readonly cardRenderer: CardRenderer,
  ) {}

  register(bot: Bot) {
    bot.command('balance', async (ctx: Context) => this.handleBalance(ctx));
  }

  async handleBalance(ctx: Context) {
      if (!ctx.from) return;
      
      const telegramId = BigInt(ctx.from.id);
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        return ctx.reply(`Please type /start first.`);
      }

      let wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) {
        return ctx.reply(`Your wallet is not initialized. Please type /start to set it up.`);
      }

      // Handle the scenario where L1 deposit takes 1-3 minutes to reach L2, and the Auto-Deposit worker failed to activate HL.
      // When the user executes /balance, we actively hook into the Onboard function to activate if funds have reached L2.
      if (!wallet.isHlRegistered) {
        wallet = await this.walletService.createWalletAndOnboard(user.id);
        if (!wallet || !wallet.isHlRegistered) {
          return ctx.reply(
            `⏳ <b>L1 Bridge Syncing...</b>\n\n` +
            `Your L1 deposit hasn't been confirmed on the Hyperliquid network yet (usually takes 1-3 minutes).\n` +
            `Please wait a few minutes and run <b>/balance</b> again to complete synchronization.`,
            { parse_mode: 'HTML' }
          );
        }
      }

      try {
        const state = await this.hlInfo.getAccountState(wallet.address);
        
        const equity = parseFloat(state.equity);
        const available = parseFloat(state.availableBalance);
        const used = parseFloat(state.marginUsed);
        const totalPnl = parseFloat(state.totalPnl);

        // ─── Render Card ───
        const logicalW = 540;
        const logicalH = 320;
        const { canvas, ctx: ctx2d, w, h } = this.cardRenderer.createCard(logicalW, logicalH);

        const changeColor = totalPnl >= 0 ? BRAND.profitGreen : BRAND.lossRed;
        const changeSign = totalPnl >= 0 ? '+' : '';
        const pnlStr = `${changeSign}$${Math.abs(totalPnl).toFixed(2)}`;

        let cy = this.cardRenderer.drawHeader(ctx2d, {
          width: w,
          subtitle: 'A C C O U N T   B A L A N C E',
          rightLabel: pnlStr,
          rightLabelColor: changeColor,
          rightSubtitle: 'TOTAL PNL',
        });

        cy = this.cardRenderer.drawTable(ctx2d, {
          headers: [
            { text: 'METRIC', pct: 0.6, align: 'left' },
            { text: 'VALUE (USD)', pct: 0.4, align: 'right' },
          ],
          rows: [
            { values: ['Equity', `$${equity.toFixed(2)}`], colors: [BRAND.textLight, BRAND.textWhite] },
            { values: ['Available Margin', `$${available.toFixed(2)}`], colors: [BRAND.textLight, BRAND.textWhite] },
            { values: ['Used Margin', `$${used.toFixed(2)}`], colors: [BRAND.textMuted, BRAND.brandTeal] },
          ],
          startY: cy + 16,
          tableWidth: w - 64, // pad 32 each side
        });

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        this.cardRenderer.drawFooter(ctx2d, w, h, `foxblaze.trade • Balance Snapshot • ${timeStr}`);

        const buffer = this.cardRenderer.toBuffer(canvas);

        const kb = new InlineKeyboard()
          .text("⬆️ Long", "nav_long").text("⬇️ Short", "nav_short").row()
          .text("📥 Deposit", "nav_deposit").text("💸 Withdraw", "nav_withdraw").row()
          .text("📈 Chart BTC", "chart_BTC_15m").text("🌊 Markets", "nav_markets");

        await ctx.replyWithPhoto(new InputFile(buffer), {
          caption: `🏦 <b>ACCOUNT OVERVIEW</b>\n\nL1 Wallet: <code>${wallet.address}</code>`,
          parse_mode: 'HTML',
          reply_markup: kb
        });
      } catch (err: any) {
        this.logger.error(`Balance error: ${err.message}`);
        await ctx.reply(`❌ Error loading balance: L1 Bridge Connector failed.`);
      }
  }
}
