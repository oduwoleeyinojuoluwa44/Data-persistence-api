import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('sessions')
export class Session {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  user_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column()
  access_token!: string;

  @Column()
  refresh_token!: string;

  @Column('timestamptz')
  access_token_expires_at!: Date;

  @Column('timestamptz')
  refresh_token_expires_at!: Date;

  @Column({ nullable: true })
  revoked_at?: Date;

  @CreateDateColumn()
  created_at!: Date;

  @Column('timestamptz', { nullable: true })
  last_used_at?: Date;
}
