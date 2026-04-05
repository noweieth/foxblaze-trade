import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HlInfoService } from './hl-info.service';
import { HlExchangeService } from './hl-exchange.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule, ConfigModule], // To access RedisService and ConfigService
  providers: [HlInfoService, HlExchangeService],
  exports: [HlInfoService, HlExchangeService],
})
export class HyperliquidModule {}
