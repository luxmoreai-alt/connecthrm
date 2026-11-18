import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayslipReleaseState1785700000000 implements MigrationInterface {
  name = 'AddPayslipReleaseState1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payslip_documents" ADD COLUMN IF NOT EXISTS "isReleased" boolean NOT NULL DEFAULT false`,
    );
    // Older releases used the file path itself as a marker. Preserve those
    // release states while allowing filePath to remain a document reference.
    await queryRunner.query(
      `UPDATE "payslip_documents" SET "isReleased" = true WHERE "filePath" = 'released'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payslip_documents" DROP COLUMN IF EXISTS "isReleased"`,
    );
  }
}
