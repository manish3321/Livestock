import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChangeApprovalInterceptor } from './change-approval.interceptor';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService, { provide: APP_INTERCEPTOR, useClass: ChangeApprovalInterceptor }],
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
