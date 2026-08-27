import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceEngineV21773200000000 implements MigrationInterface {
  name = 'AttendanceEngineV21773200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PERMISSION' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'PERMISSION';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REGULARIZED' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'REGULARIZED';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LOP' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'LOP';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MISSING_PUNCH' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'MISSING_PUNCH';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EARLY_OUT' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'EARLY_OUT';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OVERTIME' AND enumtypid = 'attendance_status_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_status_enum" ADD VALUE 'OVERTIME';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MOBILE' AND enumtypid = 'attendance_punches_source_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_punches_source_enum" ADD VALUE 'MOBILE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'KIOSK' AND enumtypid = 'attendance_punches_source_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_punches_source_enum" ADD VALUE 'KIOSK';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ADMIN' AND enumtypid = 'attendance_punches_source_enum'::regtype) THEN
          ALTER TYPE "public"."attendance_punches_source_enum" ADD VALUE 'ADMIN';
        END IF;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "totalBreakMinutes" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "earlyOutMinutes" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "overtimeMinutes" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "punchSessionsCount" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "dayType" character varying(20) NOT NULL DEFAULT 'WORKING'`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "missingPunch" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "geoFenceIssue" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "permissionMinutesApplied" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "regularized" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "appliedPolicyId" uuid`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "policyVersion" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "statusReason" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "derivedSummary" jsonb NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "isAutoClosed" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "punchDate" date`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "remarks" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "isManualOverride" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "sessionOrder" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "policyViolation" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "attendance_policies" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "organizationId" character varying(80) NOT NULL DEFAULT 'ORG_DEFAULT',
      "defaultPolicyName" character varying(180) NOT NULL DEFAULT 'Default Attendance Policy',
      "version" integer NOT NULL DEFAULT 1,
      "active" boolean NOT NULL DEFAULT true,
      "effectiveFrom" date NOT NULL,
      "workStartTime" TIME NOT NULL DEFAULT '09:00',
      "workEndTime" TIME NOT NULL DEFAULT '18:00',
      "lateGraceMinutes" integer NOT NULL DEFAULT 15,
      "halfDayMinMinutes" integer NOT NULL DEFAULT 240,
      "fullDayMinMinutes" integer NOT NULL DEFAULT 480,
      "overtimeMinMinutes" integer NOT NULL DEFAULT 30,
      "maxEarlyOutToleranceMinutes" integer NOT NULL DEFAULT 15,
      "allowMultiplePunchSessions" boolean NOT NULL DEFAULT true,
      "autoCloseOpenSessionAtEndOfDay" boolean NOT NULL DEFAULT true,
      "minimumPunchGapMinutes" integer NOT NULL DEFAULT 5,
      "officeLatitude" numeric(10,7),
      "officeLongitude" numeric(10,7),
      "allowedRadiusMeters" integer,
      "geoFenceRequired" boolean NOT NULL DEFAULT true,
      "allowAdminOverrideForGeoFenceMiss" boolean NOT NULL DEFAULT true,
      "allowRemotePunch" boolean NOT NULL DEFAULT false,
      "captureLocationOnEveryPunch" boolean NOT NULL DEFAULT true,
      "weekOffDays" character varying(100) NOT NULL DEFAULT 'SUNDAY',
      "alternateSaturdayOffRule" "public"."org_settings_alternatesaturdayoffrule_enum" NOT NULL DEFAULT 'NONE',
      "classificationConfig" jsonb NOT NULL DEFAULT '{}',
      "permissionConfig" jsonb NOT NULL DEFAULT '{}',
      "regularizationConfig" jsonb NOT NULL DEFAULT '{}',
      "policyPrecedenceConfig" jsonb NOT NULL DEFAULT '{}',
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_policies_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_attendance_policies_org_version" UNIQUE ("organizationId", "version")
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "attendance_sessions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "attendanceId" uuid NOT NULL,
      "employeeId" uuid NOT NULL,
      "date" date NOT NULL,
      "inTime" TIMESTAMP NOT NULL,
      "outTime" TIMESTAMP,
      "workedMinutes" integer NOT NULL DEFAULT 0,
      "breakAfterMinutes" integer NOT NULL DEFAULT 0,
      "sessionOrder" integer NOT NULL DEFAULT 1,
      "isAutoClosed" boolean NOT NULL DEFAULT false,
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_sessions_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type type_row
          JOIN pg_namespace namespace_row ON namespace_row.oid = type_row.typnamespace
          WHERE namespace_row.nspname = 'public'
            AND type_row.typname = 'attendance_request_status_enum'
        ) THEN
          CREATE TYPE "public"."attendance_request_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type type_row
          JOIN pg_namespace namespace_row ON namespace_row.oid = type_row.typnamespace
          WHERE namespace_row.nspname = 'public'
            AND type_row.typname = 'attendance_regularization_request_type_enum'
        ) THEN
          CREATE TYPE "public"."attendance_regularization_request_type_enum" AS ENUM(
            'MISSING_PUNCH_IN',
            'MISSING_PUNCH_OUT',
            'LATE_PUNCH',
            'EARLY_OUT',
            'GEOFENCE_FAILURE',
            'INCORRECT_STATUS',
            'OTHER'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "attendance_regularization_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "employeeId" uuid NOT NULL,
      "date" date NOT NULL,
      "requestType" "public"."attendance_regularization_request_type_enum" NOT NULL DEFAULT 'OTHER',
      "requestedInTime" TIMESTAMP,
      "requestedOutTime" TIMESTAMP,
      "reason" text NOT NULL,
      "status" "public"."attendance_request_status_enum" NOT NULL DEFAULT 'PENDING',
      "adminRemarks" text,
      "reviewedBy" uuid,
      "reviewedAt" TIMESTAMP,
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_regularization_requests_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "attendance_permission_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "employeeId" uuid NOT NULL,
      "date" date NOT NULL,
      "fromTime" TIME NOT NULL,
      "toTime" TIME NOT NULL,
      "totalMinutes" integer NOT NULL DEFAULT 0,
      "reason" text NOT NULL,
      "status" "public"."attendance_request_status_enum" NOT NULL DEFAULT 'PENDING',
      "adminRemarks" text,
      "reviewedBy" uuid,
      "reviewedAt" TIMESTAMP,
      "appliedMinutes" integer NOT NULL DEFAULT 0,
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_permission_requests_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "attendance_audit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "actorId" uuid,
      "actionType" character varying(80) NOT NULL,
      "targetType" character varying(80) NOT NULL,
      "targetId" uuid,
      "beforeData" jsonb NOT NULL DEFAULT '{}',
      "afterData" jsonb NOT NULL DEFAULT '{}',
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_audit_logs_id" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`ALTER TABLE "attendance_sessions"
      ADD CONSTRAINT "FK_attendance_sessions_attendance"
      FOREIGN KEY ("attendanceId") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "attendance_sessions"
      ADD CONSTRAINT "FK_attendance_sessions_employee"
      FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attendance_sessions_employee_date" ON "attendance_sessions" ("employeeId", "date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attendance_policies_active" ON "attendance_policies" ("organizationId", "active", "effectiveFrom")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attendance_regularization_employee_date" ON "attendance_regularization_requests" ("employeeId", "date", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_attendance_permission_employee_date" ON "attendance_permission_requests" ("employeeId", "date", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_permission_employee_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_regularization_employee_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_policies_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_sessions_employee_date"`);

    await queryRunner.query(`ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "FK_attendance_sessions_employee"`);
    await queryRunner.query(`ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "FK_attendance_sessions_attendance"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_permission_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_regularization_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_policies"`);

    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "policyViolation"`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "sessionOrder"`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "isManualOverride"`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "remarks"`);
    await queryRunner.query(`ALTER TABLE "attendance_punches" DROP COLUMN IF EXISTS "punchDate"`);

    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "isAutoClosed"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "derivedSummary"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "statusReason"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "policyVersion"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "appliedPolicyId"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "regularized"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "permissionMinutesApplied"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "geoFenceIssue"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "missingPunch"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "dayType"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "punchSessionsCount"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "overtimeMinutes"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "earlyOutMinutes"`);
    await queryRunner.query(`ALTER TABLE "attendance" DROP COLUMN IF EXISTS "totalBreakMinutes"`);
  }
}
