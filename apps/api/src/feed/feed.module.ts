import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [AuditModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
