import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { farmMemberCreateSchema } from '@farm/contracts';
import type { FarmMemberCreate } from '@farm/contracts';
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
}
