import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  await app.listen(3000);
  console.log('✅ HỆ THỐNG ĐÃ SẴN SÀNG! Bạn có thể test trực tiếp trên Telegram Bot.');
}
bootstrap();
