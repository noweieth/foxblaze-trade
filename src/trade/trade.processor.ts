import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WalletService } from '../wallet/wallet.service';
import { HlExchangeService } from '../hyperliquid/hl-exchange.service';
import { HlInfoService } from '../hyperliquid/hl-info.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../telegram/notification.service';

import { AppEvents } from '../common/events';

@Processor('trade_queue', { concurrency: 5 })
export class TradeProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeProcessor.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly hlExchange: HlExchangeService,
    private readonly hlInfo: HlInfoService,
    private readonly prisma: PrismaService,
    private readonly notify: NotificationService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`[Worker] Starting Job ID: ${job.id} | Type: ${job.name}`);
    
    // Lấy telegramId để gửi thông báo
    const user = await this.prisma.user.findUnique({ where: { id: job.data.userId } });
    const chatId = user?.telegramId;
    const wallet = await this.walletService.getWalletByUserId(job.data.userId);

    try {
      let result: any;
      switch (job.name) {
        case 'OPEN_POSITION':
          result = await this.handleOpenPosition(job.data);
          if (chatId && wallet) {
             const prepend = `✅ <b>Trade executed successfully!</b>\nPosition opened on Hyperliquid L1.`;
             AppEvents.emit('SEND_POSITIONS', chatId, wallet.address, prepend);
          }
          return result;
        case 'CLOSE_POSITION':
          await this.handleClosePosition(job.data);
          // Do not emit generic SEND_POSITIONS here, as handleClosePosition emits a specific PNL card event
          return;
        case 'SET_TP_SL':
          result = await this.handleSetTpSl(job.data);
          if (chatId) await this.notify.sendMessage(chatId, `✅ <b>TP/SL placed successfully!</b>\nUse /positions to manage.`);
          return result;
        case 'CANCEL_ORDER':
          result = await this.handleCancelOrder(job.data);
          if (chatId) await this.notify.sendMessage(chatId, `✅ <b>Order cancelled successfully!</b>`);
          return result;
        default:
          this.logger.error(`Unknown job type: ${job.name}`);
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error: any) {
      this.logger.error(`[Worker Error] Job ${job.id} failed: ${error.message}`);
      if (chatId) await this.notify.sendMessage(chatId, `❌ <b>Trade execution failed!</b>\n${error.message}`);
      throw error;
    }
  }

  private async ensureHlRegistration(userId: number) {
    let wallet = await this.walletService.getWalletByUserId(userId);
    if (!wallet) throw new Error("Wallet not found in DB");
    
    if (!wallet.isHlRegistered) {
      this.logger.log(`[Worker] Attempting Just-In-Time HL Activation for user ${userId}...`);
      const privKey = await this.walletService.getDecryptedPrivateKey(userId);
      const activated = await this.walletService.activateHlAccount(userId, privKey, wallet.agentAddress);
      
      if (!activated) {
        throw new Error("Wallet not registered on HL\n(Make sure you have deposited at least $5 USDC on Arbitrum)");
      }
      wallet = await this.walletService.getWalletByUserId(userId);
    }
    return wallet!;
  }

  private async handleOpenPosition(data: any) {
    this.logger.log(`[Debug] Data from Job: ${JSON.stringify(data)}`);
    const { userId, asset, isBuy, size, leverage, tp, sl, signalId } = data;
    
    this.logger.log(`[Debug] Checking/Activating wallet userId=${userId}`);
    const wallet = await this.ensureHlRegistration(userId);
    
    this.logger.log(`[Debug] Fetching agentKey`);
    const agentKey = await this.walletService.getDecryptedAgentKey(userId);
    const vaultAddress = wallet.address;

    try {
      // 1. Lấy thông tin giá hiện tại và params hiển thị số thập phân của coin
      const allAssets = await this.hlInfo.getAllAssets();
      const assetMeta = allAssets.find(a => a.assetId === asset);
      if (!assetMeta) throw new Error(`Không tìm thấy Asset Meta cho ID ${asset}`);

      const markets = await this.hlInfo.getMarketsData();
      const market = markets.find(m => m.name === assetMeta.name);
      if (!market) throw new Error(`Không tìm thấy giá Market cho ${assetMeta.name}`);

      const markPx = parseFloat(market.markPx);
      const sizeUsdc = parseFloat(size);
      
      // Tính toán Size theo Base Token: Size = (Ký quỹ * Đòn bẩy) / Giá
      let baseSize = (sizeUsdc * leverage) / markPx;
      
      // Bo tròn chính xác theo szDecimals cố định của sàn
      const baseSizeStr = baseSize.toFixed(assetMeta.szDecimals);

      this.logger.log(`[L1 Action] Setting leverage ${leverage}x cho asset ${asset}`);
      await this.hlExchange.setLeverage({ agentKey, vaultAddress, asset, leverage, isCross: true });

      this.logger.log(`[L1 Action] Đặt Market Order ${asset} với baseSize=${baseSizeStr} (USDC=${sizeUsdc})`);
      await this.hlExchange.placeMarketOrder({
        agentKey,
        vaultAddress,
        asset,
        isBuy,
        size: baseSizeStr,
        leverage,
        markPx
      });

      if (tp) {
        this.logger.log(`[L1 Action] Đặt lệnh Take Profit tại ${tp}`);
        await this.hlExchange.placeTakeProfit({ agentKey, vaultAddress, asset, size, triggerPrice: tp, isBuy });
      }

      if (sl) {
        this.logger.log(`[L1 Action] Đặt lệnh Stop Loss tại ${sl}`);
        await this.hlExchange.placeStopLoss({ agentKey, vaultAddress, asset, size, triggerPrice: sl, isBuy });
      }

      await this.hlInfo.invalidateUserCache(vaultAddress);
      
      await this.prisma.trade.create({
        data: {
          userId,
          status: 'OPEN',
          asset: asset.toString(),
          assetId: asset,
          side: isBuy ? 'long' : 'short',
          leverage: parseInt(leverage, 10) || 1,
          size: parseFloat(baseSizeStr) || 0,
          entryPrice: markPx, 
          takeProfitPrice: tp ? parseFloat(tp) : null,
          stopLossPrice: sl ? parseFloat(sl) : null,
          signalId: signalId || null,
        } as any
      });
      
      this.logger.log(`✅ Hoàn thành OPEN_POSITION cho user ${userId}!`);
    } catch (e: any) {
      this.logger.error(`Lỗi Open Position: ${e.message}`);
      throw e;
    }
  }

  private async handleClosePosition(data: any) {
    const { userId, asset, size, currentSide, messageId, chatId, isEmergency } = data;
    const wallet = await this.ensureHlRegistration(userId);
    
    // Lấy tên coin để hiển thị thông báo
    const allAssets = await this.hlInfo.getAllAssets();
    const assetMeta = allAssets.find(a => a.assetId === asset);
    
    if (isEmergency && chatId && assetMeta) {
        await this.notify.sendMessage(chatId, `⚠️ <b>EMERGENCY ALERT</b>\nSystem Administrator is force-closing your <b>${assetMeta.name}</b> position.\nYou will receive a PNL confirmation shortly.`);
    }

    const agentKey = await this.walletService.getDecryptedAgentKey(userId);
    const vaultAddress = wallet.address;

    // Lấy mark price cho slippage
    const markets = await this.hlInfo.getMarketsData();
    const market = assetMeta ? markets.find(m => m.name === assetMeta.name) : null;
    const markPx = market ? parseFloat(market.markPx) : 0;
    
    this.logger.log(`[L1 Action] Đóng Market Position cho asset ${asset} tại markPx=${markPx}`);
    // Đóng vị thế (đợi API confirm)
    await this.hlExchange.closePosition({ agentKey, vaultAddress, asset, size, currentSide, markPx });
    
    await this.hlInfo.invalidateUserCache(vaultAddress);

    // Update Database so /history works
    const openTrades = await this.prisma.trade.findMany({
       where: { userId, asset: asset.toString(), status: 'OPEN' }
    });

    for (const t of openTrades) {
       // PNL calculations
       const sizeFloat = parseFloat(t.size.toString()) || parseFloat(size);
       const entryPrice = t.entryPrice || 0;
       
       const uPnl = currentSide === 'long' 
          ? (markPx - entryPrice) * sizeFloat
          : (entryPrice - markPx) * sizeFloat;
          
       await this.prisma.trade.update({
          where: { id: t.id },
          data: {
             status: 'CLOSED',
             closePrice: markPx,
             pnl: uPnl,
             closedAt: new Date()
          }
       });

       // Emit an event to draw the beautiful PNL card!
       if (chatId && assetMeta) {
          const leverage = t.leverage || 1;
          const initialMargin = (sizeFloat * entryPrice) / leverage;
          const roe = initialMargin > 0 ? (uPnl / initialMargin) * 100 : 0;

          AppEvents.emit('POSITION_CLOSED_SUCCESS', {
             chatId,
             messageId,
             asset: assetMeta.name,
             side: currentSide,
             leverage,
             entry: entryPrice,
             exit: markPx,
             pnl: uPnl,
             roe: roe
          });
       }
    }
    
    this.logger.log(`✅ Hoàn thành CLOSE_POSITION cho user ${userId}! Cập nhật ${openTrades.length} trades trong DB.`);
  }

  private async handleSetTpSl(data: any) {
    const { userId, asset, isBuy, size, tp, sl } = data;
    const wallet = await this.ensureHlRegistration(userId);

    const agentKey = await this.walletService.getDecryptedAgentKey(userId);
    const vaultAddress = wallet.address;

    if (tp) {
      this.logger.log(`[L1 Action] Đặt TP tại $${tp} cho asset ${asset}`);
      await this.hlExchange.placeTakeProfit({ agentKey, vaultAddress, asset, size, triggerPrice: tp, isBuy });
    }
    if (sl) {
      this.logger.log(`[L1 Action] Đặt SL tại $${sl} cho asset ${asset}`);
      await this.hlExchange.placeStopLoss({ agentKey, vaultAddress, asset, size, triggerPrice: sl, isBuy });
    }

    await this.hlInfo.invalidateUserCache(vaultAddress);
    this.logger.log(`✅ Hoàn thành SET_TP_SL cho user ${userId}!`);
  }

  private async handleCancelOrder(data: any) {
    const { userId, asset, orderId } = data;
    const wallet = await this.ensureHlRegistration(userId);

    const agentKey = await this.walletService.getDecryptedAgentKey(userId);
    const vaultAddress = wallet.address;

    this.logger.log(`[L1 Action] Cancelling order #${orderId} cho asset ${asset}`);
    await this.hlExchange.cancelOrder({ agentKey, vaultAddress, asset, orderId });

    await this.hlInfo.invalidateUserCache(vaultAddress);
    this.logger.log(`✅ Hoàn thành CANCEL_ORDER #${orderId} cho user ${userId}!`);
  }
}
