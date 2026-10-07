import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export interface OrderItem {
  name: string;
  quantity: number;
}

@Entity({ name: 'orders' })
export class Order {
  @PrimaryColumn('uuid')
  idempotencyKey: string;

  @Column('jsonb')
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;
}
