import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
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
}
