import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis.service';
import { TradeSession } from './session.types';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly SESSION_PREFIX = 'session:';
  private readonly SESSION_TTL = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  private getKey(telegramId: bigint | string): string {
    return `${this.SESSION_PREFIX}${telegramId.toString()}`;
  }

  async get(telegramId: bigint | string): Promise<TradeSession | null> {
    const key = this.getKey(telegramId);
    const data = await this.redis.client.get(key);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data) as TradeSession;
    } catch (e) {
      this.logger.error(`Failed to parse session data for user ${telegramId}`);
      return null;
    }
  }

  async set(telegramId: bigint | string, session: TradeSession): Promise<void> {
    const key = this.getKey(telegramId);
    await this.redis.client.setex(key, this.SESSION_TTL, JSON.stringify(session));
  }

  async clear(telegramId: bigint | string): Promise<void> {
    const key = this.getKey(telegramId);
    await this.redis.client.del(key);
  }
}
