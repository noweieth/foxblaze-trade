import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  await app.listen(3000);
  console.log('✅ SYSTEM READY! You can test directly on the Telegram Bot.');
}
bootstrap();
