import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../user/user.service';
import { WalletService } from '../../wallet/wallet.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { DepositService } from '../../deposit/deposit.service';

@Injectable()
export class DepositHandler {
  private readonly logger = new Logger(DepositHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly hlInfo: HlInfoService,
    private readonly depositService: DepositService
  ) {}

  register(bot: Bot) {
    bot.command('deposit', async (ctx: Context) => this.handleDeposit(ctx));
  }

  async handleDeposit(ctx: Context) {
      if (!ctx.from) return;
      const telegramId = BigInt(ctx.from.id);
      
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        return ctx.reply(`Please type /start first.`);
      }

      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) {
        return ctx.reply(`Your wallet is not initialized. Please type /start first.`);
      }

      try {
        const accountState = await this.hlInfo.getAccountState(wallet.address);
        const equityUsdc = parseFloat(accountState.equity).toFixed(2);

        const kb = new InlineKeyboard()
          .url("📖 Docs", "https://docs.foxblaze.bot/en")
          .text("🔄 I have completed my deposit", "deposit_refresh");

        await ctx.reply(
          `💰 <b>ZERO-GAS DEPOSIT INSTRUCTIONS</b>\n\n` +
          `Your unique L1 deposit address:\n<code>${wallet.address}</code>\n\n` +
          `👉 Transfer <b>USDC (Arbitrum One Network)</b> from your personal wallet to the address above.\n\n` +
          `⚡️ <b>Perk:</b> After depositing, tap the <b>[I have completed my deposit]</b> button below. We will handle bridging to L2 (Hyperliquid) automatically with zero gas fees!\n\n` +
          `⚖️ Current L2 Equity: <b>$${equityUsdc}</b>`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } catch (err: any) {
        this.logger.error(`Deposit error: ${err.message}`);
        await ctx.reply(`❌ System error: ${err.message}`);
      }
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string): Promise<boolean> {
    if (cbData === 'deposit_refresh') {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;

      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) return true;

      await ctx.editMessageText("⏳ <b>Scanning L1 blockchain...</b>\n\nPlease wait to avoid rate limits...", { parse_mode: 'HTML' });
      
      const checkResult = await this.depositService.checkUserDeposit(user.id, wallet.address);
      
      if (checkResult.success) {
         const successKb = new InlineKeyboard().text("📊 Check Balance", "nav_balance");
         await ctx.editMessageText(`✅ <b>Success!</b> Deposit detected: <b>${checkResult.amount} USDC</b>.\n\nWe are bridging your funds from Arbitrum L1 to Hyperliquid L2.`, { parse_mode: 'HTML', reply_markup: successKb });
      } else {
         const kb = new InlineKeyboard().text("🔄 I have completed my deposit (Refresh)", 'deposit_refresh');
         await ctx.editMessageText(`⚖️ No new deposits detected on L1 yet (Minimum 1.0 USDC).\nPlease ensure you used the <b>Arbitrum One</b> network and that the transaction is marked as "SUCCESS" in your wallet.`, { parse_mode: 'HTML', reply_markup: kb });
      }
      return true;
    }
    return false;
  }
}
