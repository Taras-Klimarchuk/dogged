import type { Repository } from 'typeorm';
import { OrdersService } from './orders.service.js';
import type { Order } from './order.entity.js';
import type { CreateOrderDto } from './create-order.dto.js';

function createRepo(overrides: Partial<Repository<Order>> = {}): Repository<Order> {
  return {
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Order>) => data),
    save: vi.fn(),
    ...overrides,
  } as unknown as Repository<Order>;
}

const dto: CreateOrderDto = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

describe('OrdersService', () => {
  it('creates a new order when the idempotencyKey is unseen', async () => {
    const saved = { idempotencyKey: dto.idempotencyKey, items: dto.items, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockResolvedValue(saved);
    const service = new OrdersService(createRepo({ findOneBy, save }));

    const result = await service.placeOrder(dto);

    expect(result).toEqual({ orderId: dto.idempotencyKey, status: 'accepted' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('returns the existing order on a replayed idempotencyKey, without creating a duplicate', async () => {
    const existing = { idempotencyKey: dto.idempotencyKey, items: dto.items, createdAt: new Date() } as Order;
    const findOneBy = vi.fn().mockResolvedValue(existing);
    const save = vi.fn();
    const service = new OrdersService(createRepo({ findOneBy, save }));

    const result = await service.placeOrder(dto);

    expect(result).toEqual({ orderId: dto.idempotencyKey, status: 'accepted' });
    expect(save).not.toHaveBeenCalled();
  });

  it('recovers when two concurrent requests race on the same idempotencyKey', async () => {
    const existing = { idempotencyKey: dto.idempotencyKey, items: dto.items, createdAt: new Date() } as Order;
    const findOneBy = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const uniqueViolation = { driverError: { code: '23505' } };
    const save = vi.fn().mockRejectedValue(uniqueViolation);
    const service = new OrdersService(createRepo({ findOneBy, save }));

    const result = await service.placeOrder(dto);

    expect(result).toEqual({ orderId: dto.idempotencyKey, status: 'accepted' });
    expect(findOneBy).toHaveBeenCalledTimes(2);
  });

  it('rethrows an error from save() that is not a unique-key violation', async () => {
    const findOneBy = vi.fn().mockResolvedValue(null);
    const save = vi.fn().mockRejectedValue(new Error('connection lost'));
    const service = new OrdersService(createRepo({ findOneBy, save }));

    await expect(service.placeOrder(dto)).rejects.toThrow('connection lost');
  });
});
