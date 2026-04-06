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

    // 1. Kiểm tra kích thước lệnh cá nhân
    const realSize = targetSizeUsd * leverage; // Giá trị lệnh thực tế
    if (targetSizeUsd > maxPositionSizeUsd) {
      throw new Error(`🚫 Kích thước Ký Quỹ ($${targetSizeUsd}) vượt Trần quy định ($${maxPositionSizeUsd}).`);
    }

    try {
       // Lấy state và positions
       const [accountState, positions] = await Promise.all([
          this.hlInfo.getAccountState(walletAddress),
          this.hlInfo.getPositions(walletAddress)
       ]);

       // 2. Kiểm tra số lượng vị thế đang mở
       const openPositionsCount = positions.filter(p => parseFloat(p.size) !== 0).length;
       if (openPositionsCount >= maxPositions) {
          throw new Error(`🚫 Bạn đã mở tối đa ${maxPositions} lệnh hợp lệ. Vui lòng đóng bớt lệnh cũ để mở lệnh mới.`);
       }

       // 3. Kiểm tra trần rủi ro Margin (Chống Margin Call / Thanh lý Cross)
       const equity = parseFloat(accountState.equity);
       const marginUsed = parseFloat(accountState.marginUsed);
       
       if (equity <= 0) {
          throw new Error(`🚫 Số dư khả dụng không đủ (Equity=$${equity}).`);
       }

       // Tính tổng số tiền bị khóa nếu đánh lệnh mới này
       const newTotalMargin = marginUsed + targetSizeUsd;
       const maxAllowedMargin = equity * maxMarginRatio;

       if (newTotalMargin > maxAllowedMargin) {
          const ratioPercent = (maxMarginRatio * 100).toFixed(0);
          throw new Error(`🚫 Cảnh báo Thanh Lý Chéo! Lệnh này khiến Tổng số Margin vượt quá ${ratioPercent}% sức chịu đựng của tài khoản (Dùng: $${newTotalMargin.toFixed(2)} / Trần: $${maxAllowedMargin.toFixed(2)}).`);
       }

       this.logger.log(`Safety check passed for ${walletAddress}. TargetSize: $${targetSizeUsd}`);
    } catch (e: any) {
       // Nếu lỗi do logic risk, quăng tiếp ném ra ngoài
       if (e.message.includes('🚫')) {
          throw e;
       }
       // Nếu lỗi mạng hoặc API fail, chặn cẩn mật thay vì cho qua
       this.logger.error(`Error during risk validation: ${e.message}`);
       throw new Error(`❌ Không thể xác thực Sức Khỏe Tài Khoản qua On-chain. Vui lòng thử lại sau.`);
    }
  }
}
