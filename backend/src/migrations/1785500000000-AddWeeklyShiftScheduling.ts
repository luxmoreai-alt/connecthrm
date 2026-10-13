import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeeklyShiftScheduling1785500000000 implements MigrationInterface {
  name = 'AddWeeklyShiftScheduling1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shift_definitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(30) NOT NULL,
        "name" character varying(100) NOT NULL,
        "startTime" time NOT NULL,
        "endTime" time NOT NULL,
        "color" character varying(20) NOT NULL DEFAULT '#0B72E7',
        "isNightShift" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_shift_definitions_code" UNIQUE ("code"),
        CONSTRAINT "PK_shift_definitions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shift_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "employeeId" uuid NOT NULL,
        "shiftDate" date NOT NULL,
        "shiftId" uuid NOT NULL,
        "note" character varying(300) NOT NULL DEFAULT '',
        "assignedBy" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_shift_assignments_employee_date" UNIQUE ("employeeId", "shiftDate"),
        CONSTRAINT "PK_shift_assignments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shift_assignments_employee" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shift_assignments_shift" FOREIGN KEY ("shiftId") REFERENCES "shift_definitions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_shift_assignments_assigner" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_shift_assignments_date" ON "shift_assignments" ("shiftDate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_shift_assignments_employee" ON "shift_assignments" ("employeeId", "shiftDate")`);
    await queryRunner.query(`
      INSERT INTO "shift_definitions" ("code", "name", "startTime", "endTime", "color", "isNightShift") VALUES
        ('GENERAL', 'General Shift', '09:30', '18:30', '#0B72E7', false),
        ('MORNING', 'Morning Shift', '06:00', '15:00', '#20A56B', false),
        ('EVENING', 'Evening Shift', '14:00', '23:00', '#E58B22', false),
        ('NIGHT', 'Night Shift', '22:00', '07:00', '#7656C8', true)
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shift_definitions"`);
  }
}
