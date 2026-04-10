import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InputFile } from 'grammy';
import { UserService } from '../../user/user.service';
import { CardRenderer } from '../card-renderer.service';
import { HlInfoService } from '../../hyperliquid/hl-info.service';

@Injectable()
export class KolHandler {
  private readonly logger = new Logger(KolHandler.name);

  constructor(
    private readonly userService: UserService,
    private readonly cardRenderer: CardRenderer,
    private readonly hlInfo: HlInfoService,
  ) {}

  register(bot: Bot) {
    bot.command('fakepnl', async (ctx: Context) => this.handleFakePnl(ctx));
  }

  /**
   * /fakepnl BTC long 10x 95000 98000 500
   * Format: /fakepnl <asset> <side> <leverage>x <entry> <exit> <size_usd>
   * Only available for KOL users (isKol = true)
   */
  private async handleFakePnl(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply('❌ Please register first using /start.');

    // KOL gate
    if (!(user as any).isKol) {
      return ctx.reply('🔒 This feature is only available for KOL members.');
    }

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/);
    // parts: ["/fakepnl", "BTC", "long", "10x", "95000", "98000", "500"]

    if (parts.length < 7) {
      return ctx.reply(
        '📝 <b>Fake PnL Generator</b>\n\n' +
        'Usage:\n<code>/fakepnl &lt;asset&gt; &lt;side&gt; &lt;leverage&gt;x &lt;entry&gt; &lt;exit&gt; &lt;size_usd&gt;</code>\n\n' +
        'Example:\n<code>/fakepnl BTC long 10x 95000 98000 500</code>\n<code>/fakepnl ETH short 20x 3800 3600 200</code>\n<code>/fakepnl WTIOIL long 5x 95 97 100</code>',
        { parse_mode: 'HTML' }
      );
    }

    const assetInput = parts[1].toUpperCase();
    const sideInput = parts[2].toLowerCase();
    const leverageStr = parts[3].replace(/x$/i, '');
    const entryStr = parts[4];
    const exitStr = parts[5];
    const sizeStr = parts[6];

    // Validate side
    if (sideInput !== 'long' && sideInput !== 'short') {
      return ctx.reply('❌ Side must be <code>long</code> or <code>short</code>.', { parse_mode: 'HTML' });
    }

    const leverage = parseInt(leverageStr);
    const entry = parseFloat(entryStr);
    const exit = parseFloat(exitStr);
    const sizeUsd = parseFloat(sizeStr);

    if (isNaN(leverage) || isNaN(entry) || isNaN(exit) || isNaN(sizeUsd) || leverage < 1 || entry <= 0 || exit <= 0 || sizeUsd <= 0) {
      return ctx.reply('❌ Invalid numbers. All values must be positive.');
    }

    // Resolve asset name for display (support HIP-3: WTIOIL, GOLD, etc.)
    const fuzzy = await this.hlInfo.findAssetFuzzy(assetInput);
    const displayName = fuzzy.displayName || fuzzy.asset?.name || assetInput;

    // Calculate PnL
    const side = sideInput as 'long' | 'short';
    const priceDiff = side === 'long' ? (exit - entry) : (entry - exit);
    const baseSize = (sizeUsd * leverage) / entry;
    const pnl = priceDiff * baseSize;
    const roe = pnl / sizeUsd;

    const waitMsg = await ctx.reply('⏳ Generating PnL card...');

    try {
      const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Trader';

      const buffer = await this.cardRenderer.generateNewClosedPositionBuffer(
        (ctx as any).api?.raw ?? ctx,
        {
          telegramId,
          username,
          asset: displayName,
          side: side.toUpperCase(),
          leverage,
          entry,
          exit,
          size: sizeUsd,
          pnl,
          roe,
          hideProfit: false,
        }
      );

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      await ctx.replyWithPhoto(new InputFile(buffer), {
        caption:
          `🔥 <b>${displayName}/USDT Perpetual</b>\n` +
          `${side === 'long' ? '🟢' : '🔴'} <b>${side.toUpperCase()}</b> ${leverage}x\n\n` +
          `Entry: <code>$${entry}</code>\n` +
          `Exit: <code>$${exit}</code>\n` +
          `PnL: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b> (${roe >= 0 ? '+' : ''}${(roe * 100).toFixed(2)}%)`,
        parse_mode: 'HTML',
      });
    } catch (e: any) {
      this.logger.error(`FakePnl error: ${e.message}`);
      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, '❌ Error generating PnL card.');
    }
  }
}
