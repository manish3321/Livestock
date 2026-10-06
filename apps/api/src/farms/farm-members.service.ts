import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FarmMemberCreate, FarmMemberDto, FarmMemberUpdate, Role } from '@farm/contracts';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

const MEMBER_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  literacySupport: true,
  createdAt: true,
  memberships: { select: { farmId: true } },
  sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const;

type MemberUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  literacySupport: boolean;
  createdAt: Date;
  memberships: Array<{ farmId: string }>;
  sessions: Array<{ createdAt: Date }>;
};

/**
 * Admin "CMS" for the people on one farm. Every rule that protects the farm
 * from locking itself out lives here, not in the screens.
 */
@Injectable()
export class FarmMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser): Promise<FarmMemberDto[]> {
    const memberships = await this.prisma.farmMembership.findMany({
      where: { farmId: actor.farmId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { role: 'asc' },
    });
    return memberships.map((m) => toDto(m.role, m.user, actor));
  }

  async create(actor: RequestUser, body: FarmMemberCreate): Promise<FarmMemberDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'A user with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          phone: body.phone ?? null,
          literacySupport: body.literacySupport ?? false,
          passwordHash,
        },
      });
      await tx.farmMembership.create({
        data: { userId: user.id, farmId: actor.farmId, role: body.role },
      });
      return user;
    });
    await this.audit.record({
      farmId: actor.farmId,
      userId: actor.id,
      action: 'members.create',
      entityType: 'user',
      entityId: created.id,
      metadata: { role: body.role },
    });
    return this.getOne(actor, created.id);
  }

  async update(actor: RequestUser, userId: string, body: FarmMemberUpdate): Promise<FarmMemberDto> {
    const membership = await this.findMembership(actor, userId);
    const isSelf = userId === actor.id;
    const roleChanges = body.role !== undefined && body.role !== membership.role;

    if (isSelf && (body.isActive === false || roleChanges)) {
      throw new ForbiddenException({
        code: 'SELF_LOCKOUT',
        message: 'You cannot deactivate yourself or change your own role',
      });
    }
    const emailChanges = body.email !== undefined && body.email !== membership.user.email;
    if (membership.user.memberships.length > 1 && (emailChanges || body.password !== undefined)) {
      throw sharedAccount();
    }
    if (body.isActive === false || (roleChanges && membership.role === 'ADMIN')) {
      await this.assertAnotherAdmin(actor.farmId, userId, membership.role);
    }
    if (emailChanges) {
      const taken = await this.prisma.user.findUnique({ where: { email: body.email } });
      if (taken && taken.id !== userId) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'A user with this email already exists' });
      }
    }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;
    const signOutEverywhere = Boolean(passwordHash) || body.isActive === false;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.literacySupport !== undefined ? { literacySupport: body.literacySupport } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      if (roleChanges) {
        await tx.farmMembership.update({ where: { id: membership.id }, data: { role: body.role } });
      }
      if (signOutEverywhere) {
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    await this.audit.record({
      farmId: actor.farmId,
      userId: actor.id,
      action: body.password ? 'members.password_reset' : 'members.update',
      entityType: 'user',
      entityId: userId,
      metadata: { fields: Object.keys(body).filter((k) => k !== 'password') },
    });
    return this.getOne(actor, userId);
  }

  /**
   * Takes the person off this farm. The account row stays so the audit trail
   * keeps their name; if this was their only farm they can no longer sign in.
   */
  async remove(actor: RequestUser, userId: string): Promise<void> {
    if (userId === actor.id) {
      throw new ForbiddenException({ code: 'SELF_LOCKOUT', message: 'You cannot remove yourself from the farm' });
    }
    const membership = await this.findMembership(actor, userId);
    await this.assertAnotherAdmin(actor.farmId, userId, membership.role);
    const onlyFarm = membership.user.memberships.length <= 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { farmId: actor.farmId, assignedToId: userId },
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
    });

    await this.audit.record({
      farmId: actor.farmId,
      userId: actor.id,
      action: 'members.remove',
      entityType: 'user',
      entityId: userId,
      metadata: { role: membership.role },
    });
  }

  private async getOne(actor: RequestUser, userId: string): Promise<FarmMemberDto> {
    const membership = await this.findMembership(actor, userId);
    return toDto(membership.role, membership.user, actor);
  }

  private async findMembership(actor: RequestUser, userId: string) {
    const membership = await this.prisma.farmMembership.findFirst({
      where: { farmId: actor.farmId, userId },
      include: { user: { select: MEMBER_USER_SELECT } },
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
      throw new ConflictException({ code: 'LAST_ADMIN', message: 'Keep at least one active admin on the farm' });
    }
  }
}

function sharedAccount() {
  return new ForbiddenException({
    code: 'SHARED_ACCOUNT',
    message: 'This person also uses another farm. Only they can change their email or password.',
  });
}

function toDto(role: Role | string, user: MemberUser, actor: RequestUser): FarmMemberDto {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: role as Role,
    isActive: user.isActive,
    literacySupport: user.literacySupport,
    sharedAccount: user.memberships.length > 1,
    isSelf: user.id === actor.id,
    lastSignInAt: user.sessions[0]?.createdAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
