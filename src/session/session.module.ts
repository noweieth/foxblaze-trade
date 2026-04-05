import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
