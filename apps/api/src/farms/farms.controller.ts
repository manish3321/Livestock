import {
  Body,
  ConflictException,
  Controller,
  Get,
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
import * as bcrypt from 'bcryptjs';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('farms')
@Controller('farms')
export class FarmsController {
  constructor(private readonly prisma: PrismaService) {}

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
      },
    });
  }

  @Get('me/members')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Farm members and roles (admin)' })
  async members(@CurrentUser() user: RequestUser) {
    const memberships = await this.prisma.farmMembership.findMany({
      where: { farmId: user.farmId },
      include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
      orderBy: { role: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      isActive: m.user.isActive,
      role: m.role,
    }));
  }

  @Post('me/members')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Create a farm member (admin)' })
  async createMember(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(farmMemberCreateSchema)) body: FarmMemberCreate,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
        },
      });
      await tx.farmMembership.create({
        data: {
          userId: newUser.id,
          farmId: user.farmId,
          role: body.role,
        },
      });
      return newUser;
    });

    return {
      userId: created.id,
      email: created.email,
      name: created.name,
      role: body.role,
      isActive: created.isActive,
    };
  }

  @Patch('me/members/:userId')
  @RequirePermissions('users:manage')
  @ApiOperation({ summary: 'Update member role or active status' })
  async updateMember(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(farmMemberUpdateSchema)) body: FarmMemberUpdate,
  ) {
    const membership = await this.prisma.farmMembership.findFirst({
      where: { farmId: user.farmId, userId },
      include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    }

    if (body.isActive === false || (body.role && body.role !== 'ADMIN' && membership.role === 'ADMIN')) {
      const otherAdmins = await this.prisma.farmMembership.count({
        where: {
          farmId: user.farmId,
          role: 'ADMIN',
          userId: { not: userId },
          user: { isActive: true },
        },
      });
      if (membership.role === 'ADMIN' && otherAdmins === 0) {
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'Keep at least one active admin on the farm',
        });
      }
    }

    const [updatedUser, updatedMembership] = await this.prisma.$transaction(async (tx) => {
      const nextUser =
        body.isActive !== undefined
          ? await tx.user.update({
              where: { id: userId },
              data: { isActive: body.isActive },
              select: { id: true, email: true, name: true, isActive: true },
            })
          : membership.user;
      const nextMembership =
        body.role !== undefined
          ? await tx.farmMembership.update({
              where: { id: membership.id },
              data: { role: body.role },
            })
          : membership;
      return [nextUser, nextMembership] as const;
    });

    return {
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      isActive: updatedUser.isActive,
      role: updatedMembership.role,
    };
  }
}
