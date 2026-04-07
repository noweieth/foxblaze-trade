import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../user/user.service';
import { WalletService } from '../../wallet/wallet.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { HlExchangeService } from '../../hyperliquid/hl-exchange.service';
import { SessionService } from '../../session/session.service';
import ethers from 'ethers';

@Injectable()
export class WithdrawHandler {
  private readonly logger = new Logger(WithdrawHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly hlInfo: HlInfoService,
    private readonly hlExchange: HlExchangeService,
    private readonly sessionService: SessionService,
  ) {}

  register(bot: Bot) {
    bot.command('withdraw', async (ctx: Context) => this.handleWithdrawCommand(ctx));
  }

  async handleWithdrawCommand(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply(`Please type /start first.`);

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet) return ctx.reply(`Your wallet is not initialized. Please type /start first.`);

    try {
      const accountState = await this.hlInfo.getAccountState(wallet.address);
      const withdrawable = parseFloat(accountState.withdrawable || '0');

      if (withdrawable <= 1.0) {
        return ctx.reply(`❌ <b>Insufficient Balance</b>\n\nYou need more than $1.00 USDC to withdraw (Hyperliquid charges a $1 bridge fee).`, { parse_mode: 'HTML' });
      }

      // Enter state WAITING_ADDRESS
      await this.sessionService.set(telegramId, {
        state: 'WITHDRAW_WAITING_ADDRESS',
        data: {}
      });

      const kb = new InlineKeyboard().text("❌ Cancel", "nav_balance");
      await ctx.reply(
        `🏦 <b>WITHDRAW FUNDS</b>\n` +
        `─────────────────────\n` +
        `💰 <b>Available:</b> $${withdrawable.toFixed(2)} USDC\n` +
        `🌐 <b>Network:</b> Arbitrum One (L1)\n\n` +
        `👇 <i>Please reply with your personal Arbitrum wallet address to receive the funds.</i>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } catch (err: any) {
      this.logger.error(`Withdraw init error: ${err.message}`);
      await ctx.reply(`❌ Error initializing withdrawal: ${err.message}`);
    }
  }

  async handleTextInput(ctx: Context, telegramId: bigint, text: string): Promise<boolean> {
    const session = await this.sessionService.get(telegramId);
    if (!session) return false;

    if (session.state === 'WITHDRAW_WAITING_ADDRESS') {
      // Validate EVM Address basic regex
      if (!text.match(/^0x[a-fA-F0-9]{40}$/)) {
        await ctx.reply(`❌ <b>Invalid Address.</b>\nPlease provide a valid Arbitrum L1 wallet address (e.g. 0x...).`, { parse_mode: 'HTML' });
        return true;
      }

      session.state = 'WITHDRAW_WAITING_AMOUNT';
      session.data.withdrawAddress = text;
      await this.sessionService.set(telegramId, session);

      // Fetch max withdrawable again
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      const wallet = await this.walletService.getWalletByUserId(user.id);
      let withdrawable = 0;
      if (wallet) {
        const state = await this.hlInfo.getAccountState(wallet.address);
        withdrawable = parseFloat(state.withdrawable || '0');
      }

      const kb = new InlineKeyboard()
        .text(`💰 Withdraw ALL ($${withdrawable.toFixed(2)})`, "withdraw_amount_max").row()
        .text("❌ Cancel", "nav_balance");

      await ctx.reply(
        `✅ <b>Address Confirmed:</b>\n<code>${text}</code>\n\n` +
        `👇 <i>Please reply with the exact amount you wish to withdraw in USDC, or click the button below.</i>\n\n` +
        `⚠️ <b>Note:</b> Hyperliquid Bridge deducts a $1.00 network fee.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return true;
    }

    if (session.state === 'WITHDRAW_WAITING_AMOUNT') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply(`❌ <b>Invalid amount.</b> Please enter a valid number greater than 0.`, { parse_mode: 'HTML' });
        return true;
      }
      await this.processWithdrawal(ctx, telegramId, session.data.withdrawAddress!, amount);
      return true;
    }

    return false;
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string): Promise<boolean> {
    if (cbData === 'nav_withdraw') {
      await this.handleWithdrawCommand(ctx);
      return true;
    }

    if (cbData === 'withdraw_amount_max') {
      const session = await this.sessionService.get(telegramId);
      if (session && session.state === 'WITHDRAW_WAITING_AMOUNT') {
        const user = await this.userService.findByTelegramId(telegramId);
        if (!user) return true;
        
        const wallet = await this.walletService.getWalletByUserId(user.id);
        if (!wallet) return true;

        const state = await this.hlInfo.getAccountState(wallet.address);
        const withdrawable = parseFloat(state.withdrawable || '0');
        
        // Let's assume Max = withdrawable. Hyperliquid automatically deducts $1 from the withdrawn amount or account balance.
        // Wait, Hyperliquid withdraw requires amount > 0.
        if (withdrawable <= 1.0) {
           await ctx.reply(`❌ Available balance is too low after the $1 fee.`);
           return true;
        }

        await this.processWithdrawal(ctx, telegramId, session.data.withdrawAddress!, withdrawable);
      }
      return true;
    }

    return false;
  }

  private async processWithdrawal(ctx: Context, telegramId: bigint, destination: string, amount: number) {
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return;
    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet) return;

    await this.sessionService.clear(telegramId);
    
    // UI Feedback
    const pendingMsg = await ctx.reply(`⏳ <b>Processing Withdrawal...</b>\n\nRequesting $${amount} to be sent to:\n<code>${destination}</code>...`, { parse_mode: 'HTML' });
    
    try {
      const state = await this.hlInfo.getAccountState(wallet.address);
      const withdrawable = parseFloat(state.withdrawable || '0');
      
      if (amount > withdrawable) {
         await ctx.api.editMessageText(ctx.chat!.id, pendingMsg.message_id, `❌ <b>Failed.</b> You tried to withdraw $${amount}, but only $${withdrawable} is available.`, { parse_mode: 'HTML' });
         return;
      }

      const pKey = await this.walletService.getDecryptedPrivateKey(user.id);
      
      // Get preBalance
      const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
      const usdcContract = new ethers.Contract('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', ["function balanceOf(address owner) view returns (uint256)"], provider);
      let preBalanceNum = 0;
      try {
         const preBal = await usdcContract.balanceOf(destination);
         preBalanceNum = Number(ethers.formatUnits(preBal, 6));
      } catch(e) {}

      // Withdraw 3 execution
      const res = await this.hlExchange.withdrawFromL2(pKey, destination, amount.toString());
      if (res && res.status === 'ok') {
         const trackingKb = new InlineKeyboard().url("🔍 Track on Arbiscan", `https://arbiscan.io/address/${destination}#tokentxns`);
         await ctx.api.editMessageText(
             ctx.chat!.id, 
             pendingMsg.message_id, 
             `⏳ <b>Bridging to L1...</b>\n\n` +
             `Hyperliquid has verified the transaction. Funds are now bridging to your Arbitrum wallet: <code>${destination}</code>\n\n` +
             `<i>🚨 Please do not close the chat. The bot is actively monitoring the Arbitrum network. This typically takes 3 to 10 minutes.</i>`, 
             { parse_mode: 'HTML', reply_markup: trackingKb }
         );

         // Fire and forget background polling
         this.pollL1Arrival(ctx, pendingMsg.message_id, destination, preBalanceNum, amount);
      } else {
         const errorStr = JSON.stringify(res.response);
         await ctx.api.editMessageText(ctx.chat!.id, pendingMsg.message_id, `❌ <b>Withdrawal Failed:</b>\n${errorStr}`, { parse_mode: 'HTML' });
      }
    } catch (error: any) {
      this.logger.error(`Withdraw execution error: ${error.message}`);
      await ctx.api.editMessageText(ctx.chat!.id, pendingMsg.message_id, `❌ <b>System Error:</b> Failed to execute withdrawal. Please try again.`, { parse_mode: 'HTML' });
    }
  }

  private async pollL1Arrival(ctx: Context, msgId: number, destination: string, preBalanceNum: number, amount: number) {
    const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc');
    const usdcContract = new ethers.Contract('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', ["function balanceOf(address owner) view returns (uint256)"], provider);

    const maxWaitMs = 15 * 60 * 1000; // 15 mins
    const intervalMs = 20 * 1000; // 20 sec
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, intervalMs));
      try {
        const balanceBigInt = await usdcContract.balanceOf(destination);
        const balanceNum = Number(ethers.formatUnits(balanceBigInt, 6));

        // Note: amount > 1.0 because hyperliquid fee
        // We just check if balance increased by at least 1.0 USDC to confirm action
        if (balanceNum >= preBalanceNum + 1.0) {
           const successKb = new InlineKeyboard()
             .url("🔍 View on Arbiscan", `https://arbiscan.io/address/${destination}#tokentxns`)
             .row()
             .text("📊 Back to Balance", "nav_balance");
             
           await ctx.api.editMessageText(
               ctx.chat!.id, 
               msgId, 
               `✅ <b>Withdrawal Complete!</b>\n\nYour <b>USDC</b> has successfully arrived on Arbitrum at:\n<code>${destination}</code>\n\n<i>Note: Hyperliquid automatically deducted a $1 L1 bridge fee.</i>`, 
               { parse_mode: 'HTML', reply_markup: successKb }
           ).catch(() => {});
           return;
        }
      } catch (e: any) {
        this.logger.error(`Polling L1 Balance Error: ${e.message}`);
      }
    }

    // Timeout
    const timeoutKb = new InlineKeyboard()
      .url("🔍 Check Arbiscan", `https://arbiscan.io/address/${destination}#tokentxns`)
      .row()
      .text("📊 Back to Balance", "nav_balance");

    await ctx.api.editMessageText(
       ctx.chat!.id, 
       msgId, 
       `✅ <b>L2 Transfer Confirmed.</b>\n\nThe bridging to L1 is taking longer than 15 minutes. Check Arbiscan periodically for your funds.\n<code>${destination}</code>`, 
       { parse_mode: 'HTML', reply_markup: timeoutKb }
    ).catch(() => {});
  }
}
