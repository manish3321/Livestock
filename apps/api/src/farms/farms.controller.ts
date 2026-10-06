import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  farmMemberCreateSchema,
  farmMemberUpdateSchema,
  farmUpdateSchema,
} from '@farm/contracts';
import type {
  FarmMemberCreate,
  FarmMemberUpdate,
  FarmUpdate,
} from '@farm/contracts';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { FarmMembersService } from './farm-members.service';

@ApiTags('farms')
@Controller('farms')
export class FarmsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberService: FarmMembersService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: "The current user's farm" })
  async myFarm(@CurrentUser() user: RequestUser) {
    const farm = await this.prisma.farm.findUnique({ where: { id: user.farmId } });
    if (!farm) throw new NotFoundException({ code: 'FARM_NOT_FOUND', message: 'Farm not found' });
    return farm;
  }

  @Patch('me')
  @RequirePermissions('farm:manage')
  @ApiOperation({ summary: 'Update farm name, location, and currency' })
  async updateFarm(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(farmUpdateSchema)) body: FarmUpdate,
  ) {
    return this.prisma.farm.update({
      where: { id: user.farmId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.livestockTrackingMode !== undefined
          ? { livestockTrackingMode: body.livestockTrackingMode }
          : {}),
      },
    });
  }

  @Get('me/members')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Farm members with contact, role, status and last sign-in (admin)' })
  members(@CurrentUser() user: RequestUser) {
    return this.memberService.list(user);
  }

  @Post('me/members')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Create a farm member (admin)' })
  createMember(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(farmMemberCreateSchema)) body: FarmMemberCreate,
  ) {
    return this.memberService.create(user, body);
  }

  @Patch('me/members/:userId')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Edit a member: name, email, phone, role, status, voice alerts, or reset password' })
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(farmMemberUpdateSchema)) body: FarmMemberUpdate,
  ) {
    return this.memberService.update(user, userId, body);
  }

  @Delete('me/members/:userId')
  @HttpCode(204)
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Remove a member from this farm (admin)' })
  async removeMember(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.memberService.remove(user, userId);
  }
}

