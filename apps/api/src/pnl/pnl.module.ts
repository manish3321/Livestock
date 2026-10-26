import { Module } from '@nestjs/common';
import { PnlController } from './pnl.controller';
import { PnlService } from './pnl.service';

@Module({
  controllers: [PnlController],
  providers: [PnlService],
  exports: [PnlService],
})
export class PnlModule {}
