import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionUtil } from './encryption.util';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EncryptionUtil, RedisService],
  exports: [EncryptionUtil, RedisService],
})
export class CommonModule {}
