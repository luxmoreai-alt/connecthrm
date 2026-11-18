import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PayrollRecord } from './PayrollRecord.entity';

@Entity('payslip_documents')
export class PayslipDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  payrollRecordId: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 500 })
  filePath: string;

  @Column({ type: 'boolean', default: false })
  isReleased: boolean;

  @Column({ type: 'varchar', length: 50, default: 'application/pdf' })
  mimeType: string;

  @CreateDateColumn()
  generatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  emailedAt: Date | null;

  @OneToOne(() => PayrollRecord, (r) => r.payslipDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRecordId' })
  payrollRecord: PayrollRecord;
}
