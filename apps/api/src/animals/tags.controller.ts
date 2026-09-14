import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { tagSequenceBlockClaimSchema } from '@farm/contracts';
import type { TagSequenceBlockClaim, TagSequenceBlockDto } from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { HerdNumberService } from '../herd-number/herd-number.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly herdNumbers: HerdNumberService,
  ) {}

  @Get('blocks')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Offline short-number blocks already claimed by this device' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('deviceId') deviceId: string,
  ): Promise<TagSequenceBlockDto[]> {
    return this.prisma.$transaction((tx) => this.herdNumbers.listBlocks(tx, user.farmId, deviceId ?? ''));
  }

  @Post('blocks')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Claim the next 100 short numbers for this phone and species' })
  claim(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(tagSequenceBlockClaimSchema)) body: TagSequenceBlockClaim,
  ): Promise<TagSequenceBlockDto> {
    return this.prisma.$transaction((tx) =>
      this.herdNumbers.claimBlock(tx, user.farmId, body.species, body.deviceId),
    );
  }
}
