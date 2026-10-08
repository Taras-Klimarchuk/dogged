import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminalStock } from './terminal-stock.entity.js';
import { StockService } from './stock.service.js';
import { StockController } from './stock.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([TerminalStock]), HttpModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
