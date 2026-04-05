import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context } from 'grammy';
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

      try {
        await ctx.reply(`🦊 Welcome <b>${firstName}</b>!\nInitializing FoxBlaze trading wallet... Please wait.`, { parse_mode: 'HTML' });
        
        // 2. Wallet + SubAccount Onboarding
        const wallet = await this.walletService.createWalletAndOnboard(user.id);

        if (!wallet) {
          await ctx.reply(`❌ Wallet generation failed. Please try again.`);
          return;
        }

        const warningTxt = !wallet.isHlRegistered ? `\n\n⚠️ <i>Note: To unlock Margin Trading, a minimum first deposit of 10 USDC is required (Arbitrum network).</i>` : ``;

        await ctx.reply(
          `✅ <b>Registration Successful!</b>\n\n` +
          `💳 <b>Your Trading Wallet (Arbitrum)</b>\n` +
          `<code>${wallet.address}</code>${warningTxt}`,
          { parse_mode: 'HTML' }
        );
      } catch (err: any) {
        this.logger.error(`Start error: ${err.message}`);
        await ctx.reply(`❌ System error during wallet initialization.`);
      }
    });
  }
}
