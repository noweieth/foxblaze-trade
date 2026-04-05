import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  public readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST') || '127.0.0.1';
    const port = this.config.get<number>('REDIS_PORT') || 6379;
    
    this.client = new Redis({ host, port });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
