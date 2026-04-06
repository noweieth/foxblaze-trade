import { Injectable, Logger } from '@nestjs/common';
import { CommandContext, Context, InlineKeyboard, InputFile } from 'grammy';
import { UserService } from '../../user/user.service';
import { CardRenderer } from '../card-renderer.service';

@Injectable()
export class PremiumHandler {
  private readonly logger = new Logger(PremiumHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer
  ) {}

  public getCommands() {
    return [
      { command: 'premium', description: '⭐ Manage Premium Features (Free)' }
    ];
  }

  public register(bot: any) {
    bot.command('premium', async (ctx: CommandContext<Context>) => {
      await this.handlePremiumCommand(ctx);
    });

    bot.callbackQuery(/premium_(.+)/, async (ctx: any) => {
      await this.handleCallback(ctx);
    });
  }

  private async handlePremiumCommand(ctx: CommandContext<Context>) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Refresh user data from DB
    const user = await this.userService.findOrCreate(
      BigInt(telegramId),
      ctx.from?.username || '',
      ctx.from?.first_name || ''
    );

    if (!user.isPremium) {
      const keyboard = new InlineKeyboard().text('⭐ ACTIVATE PREMIUM (FREE) ⭐', 'premium_activate');
      await ctx.reply(
        `<b>🦊 FOXBLAZE PREMIUM</b>\n\nUpgrade your account for free to receive:\n` +
        `• VIP Signals from Admin\n` +
        `• Auto-Copy Trade system signals\n` +
        `• Increased Risk Limits: 10 Concurrent Positions & Max Size up to $10,000\n\n` +
        `<i>Click the button below to activate now!</i>`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    // User is Premium
    await this.showPremiumDashboard(ctx, user);
  }

  private async showPremiumDashboard(ctx: any, user: any) {
    const copyStatus = user.autoCopy ? '🟢 ENABLED' : '🔴 DISABLED';
    const statusIcon = user.autoCopy ? '🔕 Disable Copy Trade' : '🔔 Enable Copy Trade';
    
    let text = `<b>🦊 FOXBLAZE PREMIUM - DASHBOARD</b>\n\n`;
    text += `Status: ⭐ <b>ACTIVATED</b>\n`;
    text += `Auto Copy Signals: <b>${copyStatus}</b>\n`;
    text += `Copy Margin (Default): <b>$${user.copySize} USDC</b>\n\n`;
    text += `<i>The system will automatically enter positions when Admin sends a Signal. You can change the margin via the buttons below:</i>`;

    const keyboard = new InlineKeyboard()
      .text(statusIcon, 'premium_toggle_copy').row()
      .text('$10', 'premium_size_10')
      .text('$25', 'premium_size_25')
      .text('$50', 'premium_size_50')
      .text('$100', 'premium_size_100');

    try {
      // Generate the fresh premium card reflecting new values
      const buffer = await this.cardRenderer.generatePremiumCardBuffer({
        username: user.username || user.firstName || 'USER',
        autoCopy: user.autoCopy,
        copySize: user.copySize,
        isActivated: user.isPremium
      });
      const inputFile = new InputFile(buffer, 'premium_card.png');

      if (ctx.callbackQuery && ctx.callbackQuery.message?.photo) {
        // Edit media if it's already a photo message
        await ctx.editMessageMedia(
          {
            type: 'photo',
            media: inputFile,
            caption: text,
            parse_mode: 'HTML'
          },
          { reply_markup: keyboard }
        );
      } else {
        // If it's a text reply (e.g. initial /premium but we can't edit text into media directly), we delete previous message or just reply new photo
        if (ctx.callbackQuery) {
          await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(inputFile, { caption: text, parse_mode: 'HTML', reply_markup: keyboard });
      }
    } catch (e: any) {
      this.logger.error(`Error rendering premium card: ${e.message}`);
      // Fallback text
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      }
    }
  }

  private async handleCallback(ctx: any) {
    const action = ctx.match[1];
    const telegramId = ctx.from.id;
    const user = await this.userService.findOrCreate(BigInt(telegramId));

    try {
      if (action === 'activate') {
        const u = await this.userService.activatePremium(BigInt(telegramId));
        await ctx.answerCallbackQuery('FoxBlaze Premium activated successfully! ⭐');
        await this.showPremiumDashboard(ctx, u);
      } 
      else if (action === 'toggle_copy') {
        if (!user.isPremium) return ctx.answerCallbackQuery('Account has not activated Premium!', { show_alert: true });
        
        const newState = !user.autoCopy;
        const u = await this.userService.setAutoCopy(BigInt(telegramId), newState);
        await ctx.answerCallbackQuery(newState ? 'Auto-Copy ENABLED!' : 'Auto-Copy DISABLED!');
        await this.showPremiumDashboard(ctx, u);
      } 
      else if (action.startsWith('size_')) {
        if (!user.isPremium) return ctx.answerCallbackQuery('Account has not activated Premium!', { show_alert: true });

        const size = parseInt(action.split('_')[1], 10);
        if (isNaN(size) || size < 5) {
          return ctx.answerCallbackQuery('Invalid size!');
        }

        const u = await this.userService.setCopySize(BigInt(telegramId), size);
        await ctx.answerCallbackQuery(`Copy Margin set to $${size} USDC`);
        await this.showPremiumDashboard(ctx, u);
      }
    } catch (e: any) {
      this.logger.error(`Error handling premium callback: ${e.message}`);
      await ctx.answerCallbackQuery('An error occurred, please try again.');
    }
  }
}
