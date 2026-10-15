import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User.entity';

export enum WorkdayOverrideType {
  WORKING_DAY = 'WORKING_DAY',
  NON_WORKING_DAY = 'NON_WORKING_DAY',
}

@Entity('workday_overrides')
export class WorkdayOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  date: string;

  @Column({ type: 'enum', enum: WorkdayOverrideType })
  type: WorkdayOverrideType;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'uuid' })
  updatedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'updatedBy' })
  updater: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
