import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeEsiNumber1785400000000 implements MigrationInterface {
  name = 'AddEmployeeEsiNumber1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_details" ADD COLUMN IF NOT EXISTS "esiNumber" varchar(10)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "salary_details" DROP COLUMN IF EXISTS "esiNumber"`,
    );
  }
}
