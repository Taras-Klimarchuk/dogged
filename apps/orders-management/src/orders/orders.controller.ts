import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChaosGuard } from '@app/chaos';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './create-order.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

@ApiTags('orders')
@Controller('orders')
@UseGuards(ChaosGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary:
      'Register an order. Idempotent on idempotencyKey: replaying the same key ' +
      'returns the original order instead of creating a duplicate.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  placeOrder(@Body() order: CreateOrderDto): Promise<OrderResponseDto> {
    return this.ordersService.placeOrder(order);
  }
}
