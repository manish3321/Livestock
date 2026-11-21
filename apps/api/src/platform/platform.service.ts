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
  PlatformClientMemberDto,
  PlatformClientUpdate,
  PlatformMemberCreate,
  PlatformMemberUpdate,
  Role,
} from '@farm/contracts';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
} as const;

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
          include: { user: { select: MEMBER_SELECT } },
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
      members: farm.memberships.map((m) => this.toMember(m.role as Role, m.user)),
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

  async createMember(
    actor: RequestUser,
    farmId: string,
    body: PlatformMemberCreate,
  ): Promise<PlatformClientMemberDto> {
    await this.requireFarm(farmId);
    const email = body.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
      });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: body.name,
          phone: body.phone ?? null,
          passwordHash,
          isActive: true,
          isPlatformAdmin: false,
        },
      });
      await tx.farmMembership.create({
        data: { userId: user.id, farmId, role: body.role },
      });
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: 'platform.member.create',
          farmId,
          metadata: { userId: user.id, role: body.role, email },
        },
      });
      return user;
    });
    return this.getMember(farmId, created.id);
  }

  async updateMember(
    actor: RequestUser,
    farmId: string,
    userId: string,
    body: PlatformMemberUpdate,
  ): Promise<PlatformClientMemberDto> {
    const membership = await this.findMembership(farmId, userId);
    const roleChanges = body.role !== undefined && body.role !== membership.role;
    const emailChanges = body.email !== undefined && body.email !== membership.user.email;

    if (body.isActive === false || (roleChanges && membership.role === 'ADMIN')) {
      await this.assertAnotherAdmin(farmId, userId, membership.role);
    }
    if (emailChanges) {
      const taken = await this.prisma.user.findUnique({ where: { email: body.email } });
      if (taken && taken.id !== userId) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'A user with this email already exists',
        });
      }
    }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;
    const revokeSessions = Boolean(passwordHash) || body.isActive === false;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      if (roleChanges) {
        await tx.farmMembership.update({
          where: { id: membership.id },
          data: { role: body.role },
        });
      }
      if (revokeSessions) {
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: body.password
            ? 'platform.member.password_reset'
            : body.isActive === false
              ? 'platform.member.revoke'
              : body.isActive === true
                ? 'platform.member.grant'
                : 'platform.member.update',
          farmId,
          metadata: {
            userId,
            fields: Object.keys(body).filter((k) => k !== 'password'),
          },
        },
      });
    });

    return this.getMember(farmId, userId);
  }

  async removeMember(actor: RequestUser, farmId: string, userId: string): Promise<void> {
    const membership = await this.findMembership(farmId, userId);
    await this.assertAnotherAdmin(farmId, userId, membership.role);
    const onlyFarm = membership.user.memberships.length <= 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { farmId, assignedToId: userId },
        data: { assignedToId: null },
      });
      await tx.farmMembership.delete({ where: { id: membership.id } });
      if (onlyFarm) {
        await tx.user.update({ where: { id: userId }, data: { isActive: false } });
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.platformAudit.create({
        data: {
          actorId: actor.id,
          action: 'platform.member.remove',
          farmId,
          metadata: { userId, role: membership.role },
        },
      });
    });
  }

  private async getMember(farmId: string, userId: string): Promise<PlatformClientMemberDto> {
    const membership = await this.findMembership(farmId, userId);
    return this.toMember(membership.role as Role, membership.user);
  }

  private async requireFarm(farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
    if (!farm) {
      throw new NotFoundException({ code: 'CLIENT_NOT_FOUND', message: 'Client not found' });
    }
  }

  private async findMembership(farmId: string, userId: string) {
    const membership = await this.prisma.farmMembership.findFirst({
      where: { farmId, userId },
      include: {
        user: {
          select: {
            ...MEMBER_SELECT,
            memberships: { select: { farmId: true } },
          },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    }
    return membership;
  }

  private async assertAnotherAdmin(farmId: string, userId: string, role: Role | string): Promise<void> {
    if (role !== 'ADMIN') return;
    const otherAdmins = await this.prisma.farmMembership.count({
      where: { farmId, role: 'ADMIN', userId: { not: userId }, user: { isActive: true } },
    });
    if (otherAdmins === 0) {
      throw new ConflictException({
        code: 'LAST_ADMIN',
        message: 'Keep at least one active admin on the farm',
      });
    }
  }

  private toMember(
    role: Role,
    user: {
      id: string;
      email: string;
      name: string;
      phone?: string | null;
      isActive: boolean;
      createdAt: Date;
    },
  ): PlatformClientMemberDto {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? null,
      role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
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
