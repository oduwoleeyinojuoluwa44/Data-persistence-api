import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('profiles')
@Index(['gender'])
@Index(['age_group'])
@Index(['country_id'])
@Index(['age'])
@Index(['gender_probability'])
@Index(['country_probability'])
@Index(['created_at'])
export class Profile {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  gender!: string;

  @Column('float')
  gender_probability!: number;

  @Column()
  age!: number;

  @Column()
  age_group!: string;

  @Column({ length: 2 })
  country_id!: string;

  @Column()
  country_name!: string;

  @Column('float')
  country_probability!: number;

  @CreateDateColumn()
  created_at!: Date;
}

