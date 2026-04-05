import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InputFile } from 'grammy';
import { CardRenderer, BRAND } from '../card-renderer.service';
import { loadImage } from 'canvas';
import * as path from 'path';

@Injectable()
export class TestHandler {
  private readonly logger = new Logger(TestHandler.name);

  constructor(
    private readonly cardRenderer: CardRenderer
  ) {}

  register(bot: Bot) {
    bot.command('testclose', async (ctx: Context) => {
      const waitMsg = await ctx.reply("⏳ Generating PnL card...");
      
      // 1000x1000 to match SVG background exactly (1:1)
      const w = 1000;
      const h = 1000;
      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      // Draw SVG background — exact fit, no cropping
      try {
         const bgPath = path.join(process.cwd(), 'public', 'background_simple.svg');
         const bgImage = await loadImage(bgPath);
         ctx2d.drawImage(bgImage, 0, 0, w, h);
      } catch (e) {
         this.logger.error("Failed to load background SVG", e);
      }

      const pnl = 373.75;
      const roe = 72.50;

      this.cardRenderer.drawClosedPositionCard(ctx2d, {
        width: w,
        height: h,
        asset: 'ETH',
        side: 'LONG',
        leverage: 15,
        entry: 3100.50,
        exit: 3250.00,
        pnl: pnl,
        roe: roe,
      });

      const buffer = this.cardRenderer.toBuffer(canvas);

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);
      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `✅ <b>Position Closed</b>\n\n<b>ETH LONG 15x</b>\nRealized PNL: <b>+$373.75</b> (+72.50%)`,
        parse_mode: 'HTML'
      });
    });
  }
}
