import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Local long-lived Nest: prefer DIRECT_URL (Supabase session :5432) so
 * today/remaining stay under ~1s. Vercel/serverless must keep the transaction
 * pooler (DATABASE_URL :6543) — session mode hits max clients and crashes
 * the function (FUNCTION_INVOCATION_FAILED).
 */
function prismaUrl(): string | undefined {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (serverless) return process.env.DATABASE_URL;
  return process.env.DIRECT_URL || process.env.DATABASE_URL;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: prismaUrl(),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
