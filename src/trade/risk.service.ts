import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HlInfoService } from '../hyperliquid/hl-info.service';
import { RedisService } from '../common/redis.service';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly hlInfo: HlInfoService,
    private readonly redis: RedisService,
  ) {}

  async getRuntimeConfig() {
    const raw = await this.redis.client.get('runtime:config');
    if (raw) return JSON.parse(raw);
    return null;
  }

  /**
   * Đánh giá rủi ro trước khi mở lệnh mới.
   * Chặn lệnh nếu:
   * 1. Số lượng vị thế mở >= MAX_OPEN_POSITIONS
   * 2. Ký quỹ hiện tại + Ký quỹ dự kiến vượt quá MAX_MARGIN_RATIO * Equity
   * 3. Size của lệnh vượt quá MAX_POSITION_SIZE_USD
   */
  async checkSafety(walletAddress: string, targetSizeUsd: number, leverage: number, isPremium: boolean = false): Promise<void> {
    const runtimeConfig = await this.getRuntimeConfig();
    
    // Premium limits
    const PREMIUM_MAX_POSITIONS = 10;
    const PREMIUM_MAX_POSITION_SIZE_USD = 10000;

    const maxPositions = isPremium 
      ? PREMIUM_MAX_POSITIONS 
      : (runtimeConfig?.MAX_OPEN_POSITIONS ?? this.configService.get<number>('MAX_OPEN_POSITIONS', 5));
      
    const maxMarginRatio = runtimeConfig?.MAX_MARGIN_RATIO ?? this.configService.get<number>('MAX_MARGIN_RATIO', 0.85);

    const maxPositionSizeUsd = isPremium
      ? PREMIUM_MAX_POSITION_SIZE_USD
      : (runtimeConfig?.MAX_POSITION_SIZE_USD ?? this.configService.get<number>('MAX_POSITION_SIZE_USD', 5000));

    // 1. Check individual order size
    const realSize = targetSizeUsd * leverage; // Actual order value
    if (targetSizeUsd > maxPositionSizeUsd) {
      throw new Error(`🚫 Margin Size ($${targetSizeUsd}) exceeds the allowed limit ($${maxPositionSizeUsd}).`);
    }

    try {
       // Fetch state and positions
       const [accountState, positions] = await Promise.all([
          this.hlInfo.getAccountState(walletAddress),
          this.hlInfo.getPositions(walletAddress)
       ]);

       // 2. Check the number of open positions
       const openPositionsCount = positions.filter(p => parseFloat(p.size) !== 0).length;
       if (openPositionsCount >= maxPositions) {
          throw new Error(`🚫 You have reached the maximum of ${maxPositions} open positions. Please close some before opening new ones.`);
       }

       // 3. Check Margin risk ceiling (Prevent Margin Call / Cross Liquidation)
       const equity = parseFloat(accountState.equity);
       const marginUsed = parseFloat(accountState.marginUsed);
       
       if (equity <= 0) {
          throw new Error(`🚫 Insufficient available balance (Equity=$${equity}).`);
       }

       // Calculate total locked margin if this new order is executed
       const newTotalMargin = marginUsed + targetSizeUsd;
       const maxAllowedMargin = equity * maxMarginRatio;

       if (newTotalMargin > maxAllowedMargin) {
          const ratioPercent = (maxMarginRatio * 100).toFixed(0);
          throw new Error(`🚫 Cross-Margin Warning! This trade pushes Total Margin usage beyond the safe ${ratioPercent}% threshold (Used: $${newTotalMargin.toFixed(2)} / Limit: $${maxAllowedMargin.toFixed(2)}).`);
       }

       this.logger.log(`Safety check passed for ${walletAddress}. TargetSize: $${targetSizeUsd}`);
    } catch (e: any) {
       // If it's a risk logic error, throw it outwards
       if (e.message.includes('🚫')) {
          throw e;
       }
       // If it's a network or API failure, block strictly instead of passing through
       this.logger.error(`Error during risk validation: ${e.message}`);
       throw new Error(`❌ Unable to verify Account Health via On-chain data. Please try again later.`);
    }
  }
}
