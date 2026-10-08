import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { StockModule } from '../stock/stock.module.js';
import { MenuModule } from '../menu/menu.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), StockModule, MenuModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
