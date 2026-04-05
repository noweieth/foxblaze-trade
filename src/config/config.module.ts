import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        REDIS_HOST: Joi.string().default('127.0.0.1'),
        REDIS_PORT: Joi.number().default(6379),
        MASTER_SEED_PHRASE: Joi.string().required(),
        ENCRYPTION_KEY: Joi.string().length(64).hex().required(),
        HYPERLIQUID_MASTER_ADDRESS: Joi.string().required(),
        HYPERLIQUID_MASTER_KEY: Joi.string().required(),
        BUILDER_FEE_RATE: Joi.string().default('0.015%'),
        BUILDER_FEE_TENTHS_BPS: Joi.number().default(15),
        REFERRAL_CODE: Joi.string().required(),
        ARBITRUM_RPC_URL: Joi.string().required(),
        RELAYER_PRIVATE_KEY: Joi.string().required(),
        DEPOSIT_POLL_INTERVAL_MS: Joi.number().default(15000),
        MAX_OPEN_POSITIONS: Joi.number().default(5),
        MAX_MARGIN_RATIO: Joi.number().default(0.85),
        MAX_POSITION_SIZE_USD: Joi.number().default(5000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
      }),
    }),
  ],
})
export class ConfigModule {}
