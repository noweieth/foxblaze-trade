import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context, InlineKeyboard, InputFile } from 'grammy';
import { HlInfoService } from '../../hyperliquid/hl-info.service';
import { WalletService } from '../../wallet/wallet.service';
import { TradeService } from '../../trade/trade.service';
import { UserService } from '../../user/user.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CardRenderer, BRAND } from '../card-renderer.service';
import { loadImage } from 'canvas';
import * as path from 'path';

import { AppEvents } from '../../common/events';

@Injectable()
export class PositionHandler {
  private readonly logger = new Logger(PositionHandler.name);
  private botInstance: Bot | null = null;

  constructor(
    private readonly hlInfo: HlInfoService,
    private readonly walletService: WalletService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
    private readonly cardRenderer: CardRenderer
  ) {}

  register(bot: Bot) {
    this.botInstance = bot;
    bot.command('positions', async (ctx: Context) => this.handlePositions(ctx));
    bot.command('close', async (ctx: Context) => this.handleCloseCommand(ctx));
    bot.command('tp', async (ctx: Context) => this.handleSetTp(ctx));
    bot.command('sl', async (ctx: Context) => this.handleSetSl(ctx));

    AppEvents.on('SEND_POSITIONS', async (chatId: string | number, walletAddress: string, prependText?: string) => {
       try {
          const payload = await this.buildPositionsPayload(walletAddress);
          if (!payload) return; // No info
          
          let cap = `🦊 You have <b>${payload.count}</b> active positions. You can close them directly below, or use <code>/tp</code> and <code>/sl</code> to manage them.`;
          if (prependText) {
             cap = `${prependText}\n\n${cap}`;
          }

          await this.botInstance!.api.sendPhoto(chatId, new InputFile(payload.buffer), {
             caption: cap,
             parse_mode: 'HTML',
             reply_markup: payload.kb
          });
       } catch (e: any) {
          this.logger.error(`AppEvents SEND_POSITIONS error: ${e.message}`);
       }
    });

    AppEvents.on('POSITION_CLOSED_SUCCESS', async (data: any) => {
       try {
           const { chatId, messageId, tradeId, asset, side, leverage, entry, exit, size, pnl, roe } = data;
           
           let username = 'TRADER';
           try {
              if (this.botInstance) {
                 const chatData = await this.botInstance.api.getChat(chatId);
                 username = chatData.username || chatData.first_name || 'TRADER';
              }
           } catch(e) {}

           const buffer = await this.cardRenderer.generateNewClosedPositionBuffer(this.botInstance, {
              telegramId: BigInt(chatId),
              username,
              asset,
              side: side === 'long' ? 'LONG' : 'SHORT',
              leverage,
              entry,
              exit,
              size,
              pnl,
              roe,
              hideProfit: false
           });

           // Try to delete the old "⏳ Sending request..." message
           if (messageId && this.botInstance) {
               try {
                   await this.botInstance.api.deleteMessage(chatId, messageId);
               } catch(e) {
                   // If deleting fails (e.g. older than 48h or already deleted), ignore
               }
           }

           // Send the PNL card
           if (this.botInstance) {
               const pnlSign = pnl >= 0 ? '+' : '';
               const roeSign = roe >= 0 ? '+' : '';
               const keyboard = new InlineKeyboard()
                  .text("🙈 Hide Profit", `pnl_hide_${tradeId}`);

               await this.botInstance.api.sendPhoto(chatId, new InputFile(buffer), { 
                   caption: `✅ <b>Position Closed</b>\n\n<b>${asset} ${side.toUpperCase()} ${leverage}x</b>\nRealized PNL: <b>${pnlSign}$${Math.abs(pnl).toFixed(2)}</b> (${roeSign}${Math.abs(roe).toFixed(2)}%)`,
                   parse_mode: 'HTML',
                   reply_markup: keyboard
               });
           }

       } catch (e: any) {
           this.logger.error(`AppEvents POSITION_CLOSED_SUCCESS error: ${e.message}`);
       }
    });
  }

  private async buildPositionsPayload(walletAddress: string) {
      const [positions, openOrders] = await Promise.all([
          this.hlInfo.getPositions(walletAddress),
          this.hlInfo.getOpenOrders(walletAddress)
      ]);
      const openPositions = positions.filter(p => Math.abs(parseFloat(p.size)) > 0);

      if (openPositions.length === 0) return null;

      // Fetch candles for all positions concurrently (last 12 hours, 15m)
      const endTime = Date.now();
      const startTime = endTime - 12 * 60 * 60 * 1000;
      
      const positionsData = await Promise.all(openPositions.map(async (p) => {
        const uPnl = parseFloat(p.unrealizedPnl);
        const size = Math.abs(parseFloat(p.size));
        const entryPrice = parseFloat(p.entryPrice);
        const leverage = p.leverage;
        const initialMargin = (size * entryPrice) / leverage;
        const roe = initialMargin > 0 ? (uPnl / initialMargin) : 0;
        
        // Find TP / SL
        // TP is a reduce-only order in the opposite direction (e.g. if position is LONG, TP is SHORT), with triggerCondition 'takeProfit' (or Takeprofit orderType)
        const tpOrder = openOrders.find(o => o.asset === p.asset && o.orderType === 'Take Profit');
        const slOrder = openOrders.find(o => o.asset === p.asset && o.orderType === 'Stop Loss');

        // Fetch historical
        const rawCandles = await this.hlInfo.getCandles(p.asset, '15m', startTime, endTime);
        const candles = rawCandles.map(c => parseFloat(c.c));
        
        return {
          asset: p.asset,
          side: p.side === 'long' ? 'LONG' : 'SHORT',
          uPnl: uPnl,
          roe: roe,
          entryPrice: entryPrice,
          leverage: leverage,
          sizeUsd: (size * entryPrice).toFixed(2),
          markPrice: candles[candles.length - 1]?.toFixed(4) || "0.00",
          tpPrice: tpOrder?.price ? parseFloat(tpOrder.price).toFixed(4) : "None",
          slPrice: slOrder?.price ? parseFloat(slOrder.price).toFixed(4) : "None",
          tpFloat: tpOrder?.price ? parseFloat(tpOrder.price) : null,
          slFloat: slOrder?.price ? parseFloat(slOrder.price) : null,
          candles: candles
        };
      }));

      // Calculate total PnL
      const totalPnl = positionsData.reduce((acc, p) => acc + p.uPnl, 0);
      const isProfit = totalPnl >= 0;
      const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;
      const headSign = isProfit ? '+' : '';
      const headPnlStr = `${headSign}$${Math.abs(totalPnl).toFixed(2)}`;

      // Setup layout Dimensions
      const headerH = 74;
      const blockH = 340; 
      const footerH = 36;
      
      const w = 720;
      // Height = Header + (Blocks) + Footer + padding
      const h = headerH + 20 + (positionsData.length * blockH) + footerH;

      const { canvas, ctx: ctx2d } = this.cardRenderer.createCard(w, h);

      // Header
      let cy = this.cardRenderer.drawHeader(ctx2d, {
        width: w,
        subtitle: 'A C T I V E   P O S I T I O N S',
        rightLabel: headPnlStr,
        rightLabelColor: pnlColor,
        rightSubtitle: 'TOTAL UNREALIZED PNL',
      });

      cy += 20;

      // Draw each position block
      for (const p of positionsData) {
        cy = this.cardRenderer.drawPositionChartBlock(ctx2d, {
          startY: cy,
          width: w,
          asset: p.asset,
          side: p.side,
          uPnl: p.uPnl,
          roe: p.roe,
          entryPrice: p.entryPrice,
          tpPrice: p.tpFloat,
          slPrice: p.slFloat,
          candles: p.candles,
          metrics: [
            { label: 'SIZE', val: `$${p.sizeUsd}` },
            { label: 'ENTRY', val: `$${p.entryPrice}` },
            { label: 'MARK', val: `$${p.markPrice}` },
            { label: 'LEV', val: `${p.leverage}x` },
            { label: 'TP', val: p.tpPrice !== 'None' ? `$${p.tpPrice}` : 'None' },
            { label: 'SL', val: p.slPrice !== 'None' ? `$${p.slPrice}` : 'None' }
          ]
        });
      }

      this.cardRenderer.drawFooter(ctx2d, w, h, `foxblaze.trade • Use /tp and /sl commands to manage positions`);

      const buffer = this.cardRenderer.toBuffer(canvas);

      // Build inline buttons grouped
      const kb = new InlineKeyboard();
      for (let i = 0; i < openPositions.length; i++) {
        const asset = openPositions[i].asset;
        kb.text(`✖️ Close ${asset}`, `pos_close_${asset}`);
        kb.text(`📸 Flex ${asset}`, `pos_flex_${asset}`);
        kb.row(); 
      }

      if (openPositions.length > 1) {
        kb.text("❌ CLOSE ALL", "pos_close_ALL");
      }

      return { buffer, kb, count: openPositions.length };
  }

  private async handlePositions(ctx: Context) {
    if (!ctx.from) return;
    const telegramId = BigInt(ctx.from.id);
    const user = await this.userService.findByTelegramId(telegramId);
    if (!user) return ctx.reply("❌ Please register first using /start.");

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet || !wallet.isHlRegistered) {
       return ctx.reply("❌ Your wallet is not connected to Hyperliquid. Please type /start.");
    }

    const waitMsg = await ctx.reply("⏳ Fetching active positions...");

    try {
      const payload = await this.buildPositionsPayload(wallet.address);

      if (!payload) {
         await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, "ℹ️ You currently have no active positions.");
         return;
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id);

      await ctx.replyWithPhoto(new InputFile(payload.buffer), { 
        caption: `🦊 You have <b>${payload.count}</b> active positions. You can close them directly below, or use <code>/tp</code> and <code>/sl</code> to manage them.`,
        parse_mode: 'HTML',
        reply_markup: payload.kb 
      });

    } catch (e: any) {
       this.logger.error(`Error fetching positions: ${e.message}`);
       await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ Error loading positions data.`);
    }
  }

  private async preparePosAction(ctx: Context, expectedArgs: number): Promise<{ user: any, wallet: any, asset: string, params: string[], pos: any, meta: any } | null> {
    const text = ctx.message?.text || '';
    const parts = text.split(' ').filter(Boolean);
    if (parts.length < expectedArgs) return null;

    if (!ctx.from) return null;
    const user = await this.userService.findByTelegramId(BigInt(ctx.from.id));
    if (!user) {
       await ctx.reply("❌ Please register first using /start.");
       return null;
    }

    const wallet = await this.walletService.getWalletByUserId(user.id);
    if (!wallet || !wallet.isHlRegistered) {
       await ctx.reply("❌ Your wallet is not connected to Hyperliquid. Please type /start.");
       return null;
    }

    const assetTicker = parts[1].toUpperCase();
    
    // If the command is "/close all", it will be processed externally
    if (assetTicker === 'ALL') {
       return { user, wallet, asset: 'ALL', params: parts, pos: null, meta: null };
    }

    const meta = await this.hlInfo.findAsset(assetTicker);
    if (!meta) {
       await ctx.reply(`❌ Could not find asset <b>${assetTicker}</b> on the exchange.`, { parse_mode: 'HTML' });
       return null;
    }

    const positions = await this.hlInfo.getPositions(wallet.address);
    const pos = positions.find(p => p.asset === assetTicker && parseFloat(p.size) !== 0);

    if (!pos) {
       await ctx.reply(`❌ You do NOT have any active position for <b>${assetTicker}</b>.`, { parse_mode: 'HTML' });
       return null;
    }

    return { user, wallet, asset: assetTicker, params: parts, pos, meta };
  }

  private async handleCloseCommand(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.trim() === '/close') {
       return ctx.reply("ℹ️ Usage: `/close <ticker>` or `/close all`\nExample: `/close BTC`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 2);
    if (!data) return;

    if (data.asset === 'ALL') {
       await ctx.reply("⏳ Liquidating ALL active positions...");
       const positions = await this.hlInfo.getPositions(data.wallet.address);
       const openPositions = positions.filter(p => parseFloat(p.size) !== 0);
       
       if (openPositions.length === 0) {
          return ctx.reply("ℹ️ You have no active positions to close.");
       }

       for (const p of openPositions) {
          const meta = await this.hlInfo.findAsset(p.asset);
          if (meta) {
             await this.tradeService.queueClosePosition({
                userId: data.user.id,
                asset: meta.assetId,
                size: p.size,
                currentSide: p.side
             });
          }
       }
       await ctx.reply(`✅ Queued ${openPositions.length} Market close orders...`);
       return;
    }

    // Individual
    const waitMsg = await ctx.reply(`⏳ Closing active position for <b>${data.asset}</b> (Size: ${data.pos.size})...`, { parse_mode: 'HTML' });
    
    await this.tradeService.queueClosePosition({
       userId: data.user.id,
       asset: data.meta.assetId,
       size: data.pos.size,
       currentSide: data.pos.side,
       messageId: waitMsg.message_id,
       chatId: ctx.chat?.id,
    });
  }

  private async handleSetTp(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.split(' ').length < 3) {
       return ctx.reply("ℹ️ Usage: `/tp <ticker> <price>`\nExample: `/tp BTC 100000`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 3);
    if (!data) return;
    
    if (data.asset === 'ALL') {
       return ctx.reply("❌ This command does not support ALL.");
    }

    const price = parseFloat(data.params[2]);
    if (isNaN(price) || price <= 0) {
       return ctx.reply("❌ Invalid Take Profit price.");
    }

    await ctx.reply(`⏳ Setting Take Profit for <b>${data.asset}</b> at <b>$${price}</b>...`, { parse_mode: 'HTML' });

    await this.tradeService.queueSetTpSl({
       userId: data.user.id,
       asset: data.meta.assetId,
       isBuy: data.pos.side === 'long',
       size: data.pos.size,
       tp: price.toString()
    });
  }

  private async handleSetSl(ctx: Context) {
    const text = ctx.message?.text || '';
    if (text.split(' ').length < 3) {
       return ctx.reply("ℹ️ Usage: `/sl <ticker> <price>`\nExample: `/sl BTC 80000`", { parse_mode: 'Markdown' });
    }

    const data = await this.preparePosAction(ctx, 3);
    if (!data) return;

    if (data.asset === 'ALL') {
       return ctx.reply("❌ This command does not support ALL.");
    }

    const price = parseFloat(data.params[2]);
    if (isNaN(price) || price <= 0) {
       return ctx.reply("❌ Invalid Stop Loss price.");
    }

    await ctx.reply(`⏳ Setting Stop Loss for <b>${data.asset}</b> at <b>$${price}</b>...`, { parse_mode: 'HTML' });

    await this.tradeService.queueSetTpSl({
       userId: data.user.id,
       asset: data.meta.assetId,
       isBuy: data.pos.side === 'long',
       size: data.pos.size,
       sl: price.toString()
    });
  }

  async handleCallbackQuery(ctx: Context, telegramId: bigint, cbData: string) {
    if (cbData.startsWith('pos_close_')) {
      const asset = cbData.replace('pos_close_', '');
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      
      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) return true;

      const editMsg = async (text: string) => {
          try {
             if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
                await ctx.editMessageCaption({ caption: text, parse_mode: 'HTML' });
             } else {
                await ctx.editMessageText(text, { parse_mode: 'HTML' });
             }
          } catch(e) {}
      };

      if (asset === 'ALL') {
          await editMsg(`⏳ Sending request to close <b>ALL</b> positions...`);
          const positions = await this.hlInfo.getPositions(wallet.address);
          const openPositions = positions.filter(p => parseFloat(p.size) !== 0);
          
          if (openPositions.length === 0) {
              await editMsg(`ℹ️ You have no active positions to close.`);
              return true;
          }

          for (const p of openPositions) {
             const meta = await this.hlInfo.findAsset(p.asset);
             if (meta) {
                 await this.tradeService.queueClosePosition({
                    userId: user.id,
                    asset: meta.assetId,
                    size: p.size,
                    currentSide: p.side,
                    messageId: ctx.callbackQuery?.message?.message_id,
                    chatId: ctx.chat?.id,
                 });
             }
          }
          await editMsg(`✅ Queued ${openPositions.length} Market close orders...`);
          return true;
      }

      await editMsg(`⏳ Sending request to close <b>${asset}</b> position...`);
      
      const positions = await this.hlInfo.getPositions(wallet.address);
      const pos = positions.find(p => p.asset === asset);
      
      if (!pos) {
         await editMsg(`❌ Error: Position for <b>${asset}</b> not found.`);
         return true;
      }
      
      const meta = await this.hlInfo.findAsset(asset);
      if (!meta) return true;

      await this.tradeService.queueClosePosition({
         userId: user.id,
         asset: meta.assetId,
         size: pos.size,
         currentSide: pos.side,
         messageId: ctx.callbackQuery?.message?.message_id,
         chatId: ctx.chat?.id,
      });
      
      return true;
    }

    if (cbData.startsWith('pos_tp_')) {
      const asset = cbData.replace('pos_tp_', '');
      await ctx.answerCallbackQuery({ text: `Type: /tp ${asset} <price>`, show_alert: true });
      return true;
    }

    if (cbData.startsWith('pos_sl_')) {
      const asset = cbData.replace('pos_sl_', '');
      await ctx.answerCallbackQuery({ text: `Type: /sl ${asset} <price>`, show_alert: true });
      return true;
    }

    if (cbData.startsWith('pnl_hide_') || cbData.startsWith('pnl_show_')) {
      const isHide = cbData.startsWith('pnl_hide_');
      const tradeId = parseInt(cbData.replace(isHide ? 'pnl_hide_' : 'pnl_show_', ''), 10);
      
      const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
      if (!trade) {
         await ctx.answerCallbackQuery({ text: "Trade not found", show_alert: true });
         return true;
      }
      
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      
      let username = 'TRADER';
      try {
         if (this.botInstance) {
             const chatData = await this.botInstance.api.getChat(String(telegramId));
             username = chatData.username || chatData.first_name || 'TRADER';
         }
      } catch(e) {}
      
      const sizeFloat = parseFloat(trade.size.toString());
      const leverage = trade.leverage || 1;
      const initialMargin = (sizeFloat * (trade.entryPrice || 0)) / leverage;
      const roe = initialMargin > 0 && trade.pnl ? (trade.pnl / initialMargin) : 0;
      
      let assetName = trade.asset.toString();
      try {
         const allAssets = await this.hlInfo.getAllAssets();
         const assetMeta = allAssets.find(a => a.assetId === trade.assetId || a.assetId === parseInt(trade.asset));
         if (assetMeta) assetName = assetMeta.name;
      } catch(e) {}

      const buffer = await this.cardRenderer.generateNewClosedPositionBuffer(this.botInstance, {
          telegramId,
          username,
          asset: assetName,
          side: trade.side === 'long' ? 'LONG' : 'SHORT',
          leverage,
          entry: trade.entryPrice || 0,
          exit: trade.closePrice || 0,
          size: sizeFloat,
          pnl: trade.pnl || 0,
          roe: roe, // Fixed: Card Renderer internally multiplies by 100
          hideProfit: isHide
      });

      const pnlSign = (trade.pnl || 0) >= 0 ? '+' : '';
      const roeSign = roe >= 0 ? '+' : '';
      const keyboard = new InlineKeyboard()
         .text(isHide ? "👀 Show Profit" : "🙈 Hide Profit", isHide ? `pnl_show_${tradeId}` : `pnl_hide_${tradeId}`);

      try {
          if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
              await ctx.editMessageMedia(
                 { type: 'photo', media: new InputFile(buffer) },
                 { reply_markup: keyboard }
              );
              // Wait editMessageCaption might conflict with editMessageMedia? We can just pass caption in editMessageMedia!
              /* caption is passed inside media object for InputMediaPhoto */
          }
      } catch(e) {}

      return true;
    }

    if (cbData.startsWith('pos_flex_') || cbData.startsWith('pos_flexhide_') || cbData.startsWith('pos_flexshow_')) {
      const isHide = cbData.startsWith('pos_flexhide_');
      let asset = '';
      if (cbData.startsWith('pos_flexhide_')) asset = cbData.replace('pos_flexhide_', '');
      else if (cbData.startsWith('pos_flexshow_')) asset = cbData.replace('pos_flexshow_', '');
      else asset = cbData.replace('pos_flex_', '');

      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) return true;
      const wallet = await this.walletService.getWalletByUserId(user.id);
      if (!wallet) return true;

      // Don't alert if we are just switching mode, to avoid aggressive popups
      if (cbData.startsWith('pos_flex_')) {
         await ctx.answerCallbackQuery({ text: `📸 Generating Flex Card for ${asset}...` });
      }

      const positions = await this.hlInfo.getPositions(wallet.address);
      const pos = positions.find(p => p.asset === asset);
      
      if (!pos || parseFloat(pos.size) === 0) {
         if (cbData.startsWith('pos_flex_')) {
             await ctx.reply(`❌ Position for <b>${asset}</b> is no longer active.`, { parse_mode: 'HTML' });
         } else {
             await ctx.answerCallbackQuery({ text: `Position is closed`, show_alert: true });
         }
         return true;
      }
      
      const entryPrice = parseFloat(pos.entryPrice);
      const sizeFloat = Math.abs(parseFloat(pos.size));
      const leverage = pos.leverage || 1;
      const initialMargin = (sizeFloat * entryPrice) / leverage;
      const uPnl = parseFloat(pos.unrealizedPnl);
      const roe = initialMargin > 0 ? (uPnl / initialMargin) : 0;
      
      const isLong = pos.side === 'long';
      let markPrice = entryPrice;
      if (sizeFloat > 0) {
         markPrice = isLong ? (entryPrice + uPnl / sizeFloat) : (entryPrice - uPnl / sizeFloat);
      }

      let username = 'TRADER';
      if (this.botInstance) {
          try {
             const chatData = await this.botInstance.api.getChat(String(telegramId));
             username = chatData.username || chatData.first_name || 'TRADER';
          } catch(e) {}
      }

      const buffer = await this.cardRenderer.generateNewClosedPositionBuffer(this.botInstance, {
          telegramId,
          username,
          asset,
          side: isLong ? 'LONG' : 'SHORT',
          leverage,
          entry: entryPrice,
          exit: markPrice,
          size: sizeFloat,
          pnl: uPnl,
          roe: roe,
          hideProfit: isHide
      });

      const pnlSign = uPnl >= 0 ? '+' : '';
      const roeSign = roe >= 0 ? '+' : '';
      
      const keyboard = new InlineKeyboard()
         .text(isHide ? "👀 Show Profit" : "🙈 Hide Profit", isHide ? `pos_flexshow_${asset}` : `pos_flexhide_${asset}`);

      if (cbData.startsWith('pos_flex_')) {
          await ctx.replyWithPhoto(new InputFile(buffer), { 
              caption: `🔥 <b>Active Position PnL</b>\n\n<b>${asset} ${isLong ? 'LONG' : 'SHORT'} ${leverage}x</b>\nUnrealized PNL: <b>${pnlSign}$${Math.abs(uPnl).toFixed(2)}</b> (${roeSign}${(roe*100).toFixed(2)}%)`,
              parse_mode: 'HTML',
              reply_markup: keyboard
          });
      } else {
          try {
              if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
                  await ctx.editMessageMedia(
                     { type: 'photo', media: new InputFile(buffer) },
                     { reply_markup: keyboard }
                  );
              }
          } catch(e) {}
      }
      return true;
    }

    return false;
  }
}
