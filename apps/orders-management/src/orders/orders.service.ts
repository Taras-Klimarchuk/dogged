import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity.js';
import { CreateOrderDto } from './create-order.dto.js';
import { OrderResponseDto } from './order-response.dto.js';
import { StockService } from '../stock/stock.service.js';
import { MenuService } from '../menu/menu.service.js';
import { isUniqueViolation } from '../common/postgres-errors.js';

const INVENTORY_WARNING =
  "Order accepted, but there's an inventory issue for one or more items.";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly stock: StockService,
    private readonly menu: MenuService,
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

    const missingItems = await this.menu.findMissingNames(
      dto.items.map((item) => item.name),
    );
    if (missingItems.length > 0) {
      throw new BadRequestException(
        `unknown menu item(s): ${missingItems.join(', ')}`,
      );
    }

    const { inventoryIssue } = await this.stock.reserve(
      dto.terminalId,
      dto.items,
    );

    try {
      const saved = await this.orders.save(
        this.orders.create({
          idempotencyKey: dto.idempotencyKey,
          terminalId: dto.terminalId,
          items: dto.items,
          inventoryIssue,
        }),
      );
      return this.toResponse(saved);
    } catch (error) {
      if (!isUniqueViolation(error)) {
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

  private toResponse(order: Order): OrderResponseDto {
    return {
      orderId: order.idempotencyKey,
      status: 'accepted',
      inventoryWarning: order.inventoryIssue ? INVENTORY_WARNING : null,
    };
  }
}
