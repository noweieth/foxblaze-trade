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
      
      const pnl = 100.40;
      const roe = 0.242; // +24.2%

      let username = 'DEAN';
      if (ctx.from) {
         username = ctx.from.username || ctx.from.first_name || 'DEAN';
      }

      const buffer = await this.cardRenderer.generateNewClosedPositionBuffer(bot, {
        telegramId: BigInt(ctx.from?.id || 0),
        username: username,
        asset: 'Gold',
        side: 'long',
        leverage: 10,
        entry: 41145,
        exit: 45123,
        size: 415,
        pnl: pnl,
        roe: roe,
        hideProfit: false
      });

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);
      await ctx.replyWithPhoto(new InputFile(buffer), { 
        caption: `✅ <b>Position Closed</b>\n\n<b>Gold LONG 10x</b>\nRealized PNL: <b>+$100.40</b> (+24.20%)`,
        parse_mode: 'HTML'
      });
    });
  }
}
