import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('users')
@Index(['email'])
@Index(['github_id'])
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  github_id?: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  avatar_url?: string;

  @Column({ nullable: true })
  password_hash?: string;

  @Column({
    type: 'enum',
    enum: ['admin', 'analyst'],
    default: 'analyst'
  })
  role!: 'admin' | 'analyst';

  @Column({ default: true })
  is_active!: boolean;

  @Column('timestamptz', { nullable: true })
  last_login_at?: Date;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
