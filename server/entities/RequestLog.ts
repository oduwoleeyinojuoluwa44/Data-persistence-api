import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('request_logs')
@Index(['user_id', 'created_at'])
@Index(['created_at'])
@Index(['endpoint'])
export class RequestLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { nullable: true })
  user_id?: string;

  @Column()
  endpoint!: string;

  @Column()
  method!: string;

  @Column('int')
  status_code!: number;

  @Column({ nullable: true })
  ip_address?: string;

  @Column('int', { nullable: true })
  response_time_ms?: number;

  @CreateDateColumn()
  created_at!: Date;
}
