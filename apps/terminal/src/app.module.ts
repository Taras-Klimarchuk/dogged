import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersModule } from './orders/orders.module.js';
import { MenuModule } from './menu/menu.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), OrdersModule, MenuModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
