import type { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import type { Order } from './order.entity.js';
import type { CreateOrderDto } from './create-order.dto.js';
import type { StockService } from '../stock/stock.service.js';
import type { MenuService } from '../menu/menu.service.js';

function createRepo(overrides: Partial<Repository<Order>> = {}): Repository<Order> {
  return {
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Order>) => data),
    save: vi.fn(),
    ...overrides,
  } as unknown as Repository<Order>;
}

function createStock(inventoryIssue = false): StockService {
  return { reserve: vi.fn().mockResolvedValue({ inventoryIssue }) } as unknown as StockService;
}

function createMenu(missing: string[] = []): MenuService {
  return { findMissingNames: vi.fn().mockResolvedValue(missing) } as unknown as MenuService;
}

const dto: CreateOrderDto = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  terminalId: 'terminal-a',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

describe('OrdersService', () => {
  it('creates a new order when the idempotencyKey is unseen', async () => {
    const saved = { ...dto, inventoryIssue: false, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockResolvedValue(saved);
    const service = new OrdersService(createRepo({ findOneBy, save }), createStock(), createMenu());

    const result = await service.placeOrder(dto);

    expect(result).toEqual({
      orderId: dto.idempotencyKey,
      status: 'accepted',
      inventoryWarning: null,
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects an order containing a menu item that does not exist', async () => {
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn();
    const stock = createStock();
    const service = new OrdersService(
      createRepo({ findOneBy, save }),
      stock,
      createMenu(['Mystery Dog']),
    );

    await expect(service.placeOrder(dto)).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('reserves stock for the order\'s terminal before creating it', async () => {
    const saved = { ...dto, inventoryIssue: false, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockResolvedValue(saved);
    const stock = createStock();
    const service = new OrdersService(createRepo({ findOneBy, save }), stock, createMenu());

    await service.placeOrder(dto);

    expect(stock.reserve).toHaveBeenCalledWith(dto.terminalId, dto.items);
  });

  it('surfaces an inventory warning when stock was insufficient', async () => {
    const saved = { ...dto, inventoryIssue: true, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockResolvedValue(saved);
    const service = new OrdersService(
      createRepo({ findOneBy, save }),
      createStock(true),
      createMenu(),
    );

    const result = await service.placeOrder(dto);

    expect(result.inventoryWarning).not.toBeNull();
  });

  it('returns the existing order on a replayed idempotencyKey, without creating a duplicate or touching stock/menu', async () => {
    const existing = { ...dto, inventoryIssue: false, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(existing);
    const save = vi.fn();
    const stock = createStock();
    const menu = createMenu();
    const service = new OrdersService(createRepo({ findOneBy, save }), stock, menu);

    const result = await service.placeOrder(dto);

    expect(result).toEqual({
      orderId: dto.idempotencyKey,
      status: 'accepted',
      inventoryWarning: null,
    });
    expect(save).not.toHaveBeenCalled();
    expect(stock.reserve).not.toHaveBeenCalled();
    expect(menu.findMissingNames).not.toHaveBeenCalled();
  });

  it('recovers when two concurrent requests race on the same idempotencyKey', async () => {
    const existing = { ...dto, inventoryIssue: false, createdAt: new Date() } as Order;
    const findOneBy = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const uniqueViolation = { driverError: { code: '23505' } };
    const save = vi.fn().mockRejectedValue(uniqueViolation);
    const service = new OrdersService(createRepo({ findOneBy, save }), createStock(), createMenu());

    const result = await service.placeOrder(dto);

    expect(result).toEqual({
      orderId: dto.idempotencyKey,
      status: 'accepted',
      inventoryWarning: null,
    });
    expect(findOneBy).toHaveBeenCalledTimes(2);
  });

  it('rethrows an error from save() that is not a unique-key violation', async () => {
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockRejectedValue(new Error('connection lost'));
    const service = new OrdersService(createRepo({ findOneBy, save }), createStock(), createMenu());

    await expect(service.placeOrder(dto)).rejects.toThrow('connection lost');
  });
});
