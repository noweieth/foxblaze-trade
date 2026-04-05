import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly botToken: string;
  private readonly apiBase: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId: string | bigint, text: string) {
    try {
      const res = await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.toString(),
          text,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        this.logger.warn(`sendMessage failed: ${res.status} ${await res.text()}`);
      }
    } catch (e: any) {
      this.logger.error(`Notification error: ${e.message}`);
    }
  }
}
