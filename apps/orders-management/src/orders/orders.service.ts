import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity.js';
import { CreateOrderDto } from './create-order.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  async placeOrder(dto: CreateOrderDto): Promise<OrderResponseDto> {
    const existing = await this.orders.findOneBy({
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing) {
      this.logger.log(
        `replayed idempotencyKey=${dto.idempotencyKey}, returning existing order`,
      );
      return this.toResponse(existing);
    }

    try {
      const saved = await this.orders.save(
        this.orders.create({
          idempotencyKey: dto.idempotencyKey,
          items: dto.items,
        }),
      );
      return this.toResponse(saved);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      // lost the race to a concurrent request with the same idempotencyKey.
      const order = await this.orders.findOneBy({
        idempotencyKey: dto.idempotencyKey,
      });
      if (!order) {
        throw error;
      }
      return this.toResponse(order);
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { driverError?: { code?: string } }).driverError?.code ===
        POSTGRES_UNIQUE_VIOLATION
    );
  }

  private toResponse(order: Order): OrderResponseDto {
    return { orderId: order.idempotencyKey, status: 'accepted' };
  }
}
