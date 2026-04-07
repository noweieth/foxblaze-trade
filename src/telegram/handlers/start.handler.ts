import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../user/user.service';
import { WalletService } from '../../wallet/wallet.service';

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
  ) {}

  register(bot: Bot) {
    bot.command('start', async (ctx: Context) => {
      if (!ctx.from) return;

      const telegramId = BigInt(ctx.from.id);
      const username = ctx.from.username || undefined;
      const firstName = ctx.from.first_name;

      // 1. Database User Lookup
      const user = await this.userService.findOrCreate(telegramId, username, firstName);
      const existingWallet = await this.walletService.getWalletByUserId(user.id);

      try {
        if (!existingWallet) {
           await ctx.reply(`🦊 Welcome <b>${firstName}</b>!\nInitializing FoxBlaze trading wallet... Please wait.`, { parse_mode: 'HTML' });
        } else {
           await ctx.reply(`🦊 Welcome back <b>${firstName}</b>!\nLoading your FoxBlaze trading wallet...`, { parse_mode: 'HTML' });
        }
        
        // 2. Wallet + SubAccount Onboarding
        const wallet = await this.walletService.createWalletAndOnboard(user.id);

        if (!wallet) {
          await ctx.reply(`❌ Wallet generation failed. Please try again.`);
          return;
        }

        const warningTxt = !wallet.isHlRegistered ? `\n\n⚠️ <i>Note: To unlock Margin Trading, a minimum first deposit of 10 USDC is required (Arbitrum network).</i>` : ``;

        const kb = new InlineKeyboard()
          .text("📥 Deposit USDC", "nav_deposit")
          .text("📊 Balance", "nav_balance").row()
          .text("📈 Chart BTC", "chart_BTC_15m")
          .url("📖 Documentation", "https://docs.foxblaze.bot/en").row()
          .text("❓ Help", "nav_help");

        const headerStr = existingWallet ? `✅ <b>Wallet Loaded!</b>` : `✅ <b>Registration Successful!</b>`;

        await ctx.reply(
          `${headerStr}\n\n` +
          `💳 <b>Your Trading Wallet (Arbitrum)</b>\n` +
          `<code>${wallet.address}</code>${warningTxt}\n\n` +
          `<i>Use the quick buttons below to navigate:</i>`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } catch (err: any) {
        this.logger.error(`Start error: ${err.message}`);
        await ctx.reply(`❌ System error during wallet initialization.`);
      }
    });
  }
}
