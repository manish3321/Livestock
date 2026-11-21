import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type {
  PlatformClientCreate,
  PlatformClientDetailDto,
  PlatformClientListItemDto,
  PlatformClientUpdate,
  Role,
} from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(): Promise<PlatformClientListItemDto[]> {
    const farms = await this.prisma.farm.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
        },
      },
    });
    return farms.map((farm) => this.toListItem(farm));
  }

  async getClient(farmId: string): Promise<PlatformClientDetailDto> {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true, isActive: true, createdAt: true } } },
          orderBy: { role: 'asc' },
        },
      },
    });
    if (!farm) {
      throw new NotFoundException({ code: 'CLIENT_NOT_FOUND', message: 'Client not found' });
    }
    const base = this.toListItem(farm);
    return {
      ...base,
      members: farm.memberships.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role as Role,
        isActive: m.user.isActive,
        createdAt: m.user.createdAt.toISOString(),
      })),
    };
  }

  async createClient(actor: RequestUser, body: PlatformClientCreate): Promise<PlatformClientDetailDto> {
    const email = body.adminEmail.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
      });
    }
    const passwordHash = await bcrypt.hash(body.adminPassword, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: {
          name: body.name,
          location: body.location?.trim() ? body.location.trim() : null,
          currency: 'NPR',
          timezone: 'Asia/Kathmandu',
          isActive: true,
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          name: body.adminName,
          passwordHash,
          isActive: true,
          isPlatformAdmin: false,
        },
      });
      await tx.farmMembership.create({
        data: { userId: user.id, farmId: farm.id, role: 'ADMIN' },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: 'platform.client.create',
          farmId: farm.id,
          metadata: { adminEmail: email },
        },
      });
      return farm.id;
    });
    return this.getClient(created);
  }

  async updateClient(
    actor: RequestUser,
    farmId: string,
    body: PlatformClientUpdate,
  ): Promise<PlatformClientDetailDto> {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException({ code: 'CLIENT_NOT_FOUND', message: 'Client not found' });
    }

    const suspending = body.isActive === false && farm.isActive;
    await this.prisma.$transaction(async (tx) => {
      await tx.farm.update({
        where: { id: farmId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.location !== undefined
            ? { location: body.location?.trim() ? body.location.trim() : null }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      if (suspending) {
        const memberIds = await tx.farmMembership.findMany({
          where: { farmId },
          select: { userId: true },
        });
        const userIds = memberIds.map((m) => m.userId);
        if (userIds.length > 0) {
          await tx.refreshSession.updateMany({
            where: { userId: { in: userIds }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: suspending
            ? 'platform.client.suspend'
            : body.isActive === true && !farm.isActive
              ? 'platform.client.reactivate'
              : 'platform.client.update',
          farmId,
          metadata: {
            fields: Object.keys(body).filter((k) => (body as Record<string, unknown>)[k] !== undefined),
          },
        },
      });
    });

    return this.getClient(farmId);
  }

  private toListItem(farm: {
    id: string;
    name: string;
    location: string | null;
    isActive: boolean;
    createdAt: Date;
    memberships: Array<{
      role: string;
      user: { name: string; email: string; isActive: boolean };
    }>;
  }): PlatformClientListItemDto {
    const admin = farm.memberships.find((m) => m.role === 'ADMIN' && m.user.isActive)
      ?? farm.memberships.find((m) => m.role === 'ADMIN');
    return {
      farmId: farm.id,
      name: farm.name,
      location: farm.location,
      isActive: farm.isActive,
      adminName: admin?.user.name ?? null,
      adminEmail: admin?.user.email ?? null,
      staffCount: farm.memberships.length,
      createdAt: farm.createdAt.toISOString(),
    };
  }
}
