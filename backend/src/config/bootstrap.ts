import { AppDataSource } from './database';
import { seedAdmin } from '../seed/seedAdmin';
import webPush from 'web-push';
import { env } from './env';
import { ensureCombinedGovernmentHolidays2026 } from './holidayCalendar2026';

let bootstrapPromise: Promise<void> | null = null;

/** Reuses one initialization promise per warm Vercel function instance. */
export const ensureBackendReady = async (): Promise<void> => {
  if (AppDataSource.isInitialized) return;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await AppDataSource.initialize();
      // Production intentionally keeps TypeORM synchronize disabled for
      // established databases. A brand-new Neon database, however, has no
      // schema for migrations/runtime patches to update. Bootstrap the entity
      // schema only when the core users table is absent; existing databases
      // are never synchronized or rewritten by this path.
      const [schemaState] = await AppDataSource.query(
        `SELECT to_regclass('public.users') AS "usersTable"`,
      );
      if (!schemaState?.usersTable) {
        await AppDataSource.synchronize();
      }
      // Vercel runs the TypeScript serverless entry directly and does not run
      // the package's production migration command. Keep additive runtime
      // schema changes idempotent so a newly deployed function can safely
      // bring an existing database forward before repositories query it.
      await AppDataSource.query(
        `ALTER TABLE "attendance_punches"
         ADD COLUMN IF NOT EXISTS "photoUrl" character varying(1000)`,
      );
      // The Vercel serverless entry does not execute package.json migration
      // scripts. Apply additive employee-archive schema before any auth query
      // selects User.deletedAt.
      await AppDataSource.query(
        `ALTER TABLE "users"
         ADD COLUMN IF NOT EXISTS "deletedAt" timestamp`,
      );
      // Existing employees should not be interrupted after deployment. New
      // employees start with the guided tour pending.
      await AppDataSource.query(
        `ALTER TABLE "users"
         ADD COLUMN IF NOT EXISTS "employeeTourCompleted" boolean NOT NULL DEFAULT true`,
      );
      await AppDataSource.query(
        `ALTER TABLE "users" ALTER COLUMN "employeeTourCompleted" SET DEFAULT false`,
      );
      await AppDataSource.query(
        `ALTER TABLE "salary_details"
         ADD COLUMN IF NOT EXISTS "esiNumber" character varying(10)`,
      );
      // OrgSettings is loaded by attendance, payroll, dashboard, and settings.
      // Keep these additive payslip-branding columns available before TypeORM
      // performs any entity SELECT in a Vercel serverless function.
      await AppDataSource.query(
        `ALTER TABLE "org_settings"
         ADD COLUMN IF NOT EXISTS "companyLogoUrl" text,
         ADD COLUMN IF NOT EXISTS "cinNumber" character varying(21),
         ADD COLUMN IF NOT EXISTS "gstNumber" character varying(15),
         ADD COLUMN IF NOT EXISTS "payslipAdditionalFields" jsonb NOT NULL DEFAULT '[]'::jsonb`,
      );
      await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "userAgent" character varying(500),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscriptions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
      await AppDataSource.query(
        `CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_user" ON "push_subscriptions" ("userId")`,
      );
      await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "hr_portal_access" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "loginEmail" character varying(255) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "grantedBy" uuid NOT NULL,
        "grantedAt" timestamp NOT NULL DEFAULT now(),
        "revokedBy" uuid,
        "revokedAt" timestamp,
        "lastLoginAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_portal_access" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hr_portal_access_employee" UNIQUE ("employeeId"),
        CONSTRAINT "UQ_hr_portal_access_email" UNIQUE ("loginEmail"),
        CONSTRAINT "FK_hr_portal_access_employee" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
      await AppDataSource.query(
        `CREATE INDEX IF NOT EXISTS "IDX_hr_portal_access_active" ON "hr_portal_access" ("isActive")`,
      );
      await AppDataSource.query(`CREATE TABLE IF NOT EXISTS "app_runtime_config" (
        "key" character varying(100) NOT NULL,
        "value" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_runtime_config" PRIMARY KEY ("key")
      )`);
      await ensureCombinedGovernmentHolidays2026((sql, parameters) =>
        AppDataSource.query(sql, parameters),
      );
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        const generated = webPush.generateVAPIDKeys();
        await AppDataSource.query(
          `INSERT INTO "app_runtime_config" ("key", "value")
           VALUES ('web_push_vapid', $1)
           ON CONFLICT ("key") DO NOTHING`,
          [JSON.stringify(generated)],
        );
      }
      await seedAdmin();
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
};
