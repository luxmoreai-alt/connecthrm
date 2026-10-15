import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkdayOverrides1785600000000 implements MigrationInterface {
  name = 'AddWorkdayOverrides1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "public"."workday_overrides_type_enum" AS ENUM('WORKING_DAY', 'NON_WORKING_DAY');
    EXCEPTION WHEN duplicate_object THEN null; END $$;`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "workday_overrides" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "date" date NOT NULL,
      "type" "public"."workday_overrides_type_enum" NOT NULL,
      "reason" character varying(500) NOT NULL,
      "updatedBy" uuid NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_workday_overrides_date" UNIQUE ("date"),
      CONSTRAINT "PK_workday_overrides_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_workday_overrides_updater" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workday_overrides_date" ON "workday_overrides" ("date")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workday_overrides"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."workday_overrides_type_enum"`);
  }
}
