import type { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from './create-order.dto.js';

function createAxiosError(status: number, data: unknown) {
  return { isAxiosError: true, response: { status, data } };
}

function createHttpService(post: ReturnType<typeof vi.fn>): HttpService {
  return { post } as unknown as HttpService;
}

function createConfigService(): ConfigService {
  return { get: () => 'http://orders-management:3001' } as unknown as ConfigService;
}

const order: CreateOrderDto = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

describe('OrdersService', () => {
  it('returns orders-management\'s response on success', async () => {
    const response = { orderId: 'order-1', status: 'accepted' as const };
    const post = vi.fn().mockReturnValue(of({ data: response }));
    const service = new OrdersService(createHttpService(post), createConfigService());

    await expect(service.placeOrder(order)).resolves.toEqual(response);
    expect(post).toHaveBeenCalledWith(
      'http://orders-management:3001/orders',
      order,
    );
  });

  it('throws ServiceUnavailableException once retries are exhausted', async () => {
    const post = vi.fn().mockReturnValue(throwError(() => new Error('down')));
    const service = new OrdersService(createHttpService(post), createConfigService());

    await expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('opens the circuit after repeated failures and stops calling orders-management', async () => {
    const post = vi.fn().mockReturnValue(throwError(() => new Error('down')));
    const service = new OrdersService(createHttpService(post), createConfigService());

    await expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );
    const callsAfterFirstOrder = post.mock.calls.length;

    await expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );

    // the breaker should already be open from the first call's own retries,
    // so the second placeOrder() must fail fast without calling http.post again.
    expect(post.mock.calls.length).toBe(callsAfterFirstOrder);
  });

  it('propagates a 4xx rejection as-is without retrying', async () => {
    const axiosError = createAxiosError(400, { message: 'invalid item' });
    const post = vi.fn().mockReturnValue(throwError(() => axiosError));
    const service = new OrdersService(createHttpService(post), createConfigService());

    await expect(service.placeOrder(order)).rejects.toMatchObject(
      new HttpException({ message: 'invalid item' }, 400),
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not open the circuit on repeated 4xx rejections', async () => {
    const axiosError = createAxiosError(400, { message: 'invalid item' });
    const post = vi.fn().mockReturnValue(throwError(() => axiosError));
    const service = new OrdersService(createHttpService(post), createConfigService());

    await expect(service.placeOrder(order)).rejects.toBeInstanceOf(HttpException);
    await expect(service.placeOrder(order)).rejects.toBeInstanceOf(HttpException);

    // each call should have hit orders-management exactly once — no retries,
    // and the breaker never saw these as failures.
    expect(post).toHaveBeenCalledTimes(2);
  });
});
