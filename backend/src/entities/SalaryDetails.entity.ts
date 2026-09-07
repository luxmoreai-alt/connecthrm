import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User.entity';

export interface SalaryComponent {
  name: string;
  amount: number;
  category?: string;
}

@Entity('salary_details')
export class SalaryDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  // ─── Fixed fields ───
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ctc: number;

  // Legacy fixed fields — kept for backward compat, new data goes in earnings/deductions jsonb
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  basic: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  hra: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  allowances: number;

  @Column({ type: 'boolean', default: true })
  pfApplicable: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pfEmployeeContribution: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pfEmployerContribution: number;

  @Column({ type: 'varchar', length: 10, default: 'New' })
  taxRegime: string;

  // ─── Dynamic components ───
  @Column({ type: 'jsonb', default: [] })
  earnings: SalaryComponent[];

  @Column({ type: 'jsonb', default: [] })
  deductions: SalaryComponent[];

  // ─── Banking Information ───
  @Column({ type: 'varchar', length: 30, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ifscCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  accountHolderName: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  bankMobileNumber: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branchName: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  panNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  uanNumber: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  esiNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
