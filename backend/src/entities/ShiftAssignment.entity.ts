import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ShiftDefinition } from './ShiftDefinition.entity';
import { User } from './User.entity';

@Entity('shift_assignments')
@Unique(['employeeId', 'shiftDate'])
export class ShiftAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'date' })
  shiftDate: string;

  @Column({ type: 'uuid' })
  shiftId: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  note: string;

  @Column({ type: 'uuid' })
  assignedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: User;

  @ManyToOne(() => ShiftDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shiftId' })
  shift: ShiftDefinition;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assignedBy' })
  assignedByUser: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
