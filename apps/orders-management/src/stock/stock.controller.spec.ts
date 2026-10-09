import { Test, TestingModule } from '@nestjs/testing';
import { ChaosGuard } from '@app/chaos';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

describe('StockController', () => {
  let controller: StockController;
  const stockService = { completeRestock: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockController],
      providers: [{ provide: StockService, useValue: stockService }],
    })
      .overrideGuard(ChaosGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StockController>(StockController);
  });

  it('delegates to StockService.completeRestock()', async () => {
    const dto = { terminalId: 'terminal-a', itemName: 'Hot Dog', quantity: 50 };
    stockService.completeRestock.mockResolvedValue(undefined);

    await controller.completeRestock(dto);

    expect(stockService.completeRestock).toHaveBeenCalledWith('terminal-a', 'Hot Dog', 50);
  });
});
