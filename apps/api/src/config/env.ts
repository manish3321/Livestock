import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  STORAGE_DRIVER: z.enum(['local', 'mongodb', 'r2']).default('local'),
  MONGODB_URI: z.string().optional().default(''),
  MONGODB_BUCKET: z.string().optional().default('farm-files'),
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default(''),
  R2_PUBLIC_BASE_URL: z.string().optional().default(''),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  SMS_MONTHLY_CAP: z.coerce.number().int().min(0).default(40),
}).superRefine((data, ctx) => {
  if (data.STORAGE_DRIVER === 'mongodb' && !data.MONGODB_URI) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MONGODB_URI'],
      message: 'required when STORAGE_DRIVER=mongodb',
    });
  }
  if (data.STORAGE_DRIVER === 'r2') {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required when STORAGE_DRIVER=r2',
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validate process.env once at boot; fail fast with a readable message. */
export function loadEnv(): Env {
  if (!cached) {
    if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
      process.env.DIRECT_URL = process.env.DATABASE_URL;
    }
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper. */
export function resetEnvCache(): void {
  cached = undefined;
}
