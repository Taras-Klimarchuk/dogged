import { Registry } from '@prometheus-io/client';
import { ResilienceMetrics } from '@app/metrics';
import type { Repository } from 'typeorm';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { StockService } from './stock.service.js';
import type { TerminalStock } from './terminal-stock.entity.js';

const metrics = new ResilienceMetrics(new Registry());

function createStockRepo(
  overrides: Partial<Repository<TerminalStock>> = {},
): Repository<TerminalStock> {
  return {
    query: vi.fn(),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  } as unknown as Repository<TerminalStock>;
}

function createHttp(post: ReturnType<typeof vi.fn>): HttpService {
  return { post } as unknown as HttpService;
}

function createConfig(): ConfigService {
  return { get: () => 'http://warehouse:3002' } as unknown as ConfigService;
}

describe('StockService', () => {
  it('decrements atomically and returns the post-decrement quantity', async () => {
    const query = vi.fn().mockResolvedValue([{ quantity: 45, capacity: 50, wasInsufficient: false }]);
    const stockRepo = createStockRepo({ query });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    const result = await service.reserve('terminal-a', [{ name: 'Hot Dog', quantity: 5 }]);

    expect(result.inventoryIssue).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['terminal-a', 'Hot Dog', 5]);
  });

  it('flags inventoryIssue when the database reports the request as insufficient', async () => {
    const query = vi.fn().mockResolvedValue([{ quantity: 0, capacity: 50, wasInsufficient: true }]);
    const stockRepo = createStockRepo({ query });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    const result = await service.reserve('terminal-a', [{ name: 'Hot Dog', quantity: 5 }]);

    expect(result.inventoryIssue).toBe(true);
  });

  it('throws NotFoundException when the terminal/item has no stock row at all', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const stockRepo = createStockRepo({ query });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    await expect(
      service.reserve('unknown-terminal', [{ name: 'Hot Dog', quantity: 1 }]),
    ).rejects.toThrow(NotFoundException);
  });

  it('claims restockPending atomically before sending a restock request', async () => {
    const query = vi.fn().mockResolvedValue([{ quantity: 10, capacity: 50, wasInsufficient: false }]);
    const update = vi.fn().mockResolvedValue({ affected: 1 });
    const stockRepo = createStockRepo({ query, update });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    await service.reserve('terminal-a', [{ name: 'Hot Dog', quantity: 10 }]);

    expect(update).toHaveBeenCalledWith(
      { terminalId: 'terminal-a', itemName: 'Hot Dog', restockPending: false },
      { restockPending: true },
    );
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        'http://warehouse:3002/restock',
        expect.objectContaining({ terminalId: 'terminal-a', itemName: 'Hot Dog' }),
      );
    });
  });

  it('does not send a restock request when the claim affects no rows (already pending)', async () => {
    const query = vi.fn().mockResolvedValue([{ quantity: 10, capacity: 50, wasInsufficient: false }]);
    const update = vi.fn().mockResolvedValue({ affected: 0 });
    const stockRepo = createStockRepo({ query, update });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    await service.reserve('terminal-a', [{ name: 'Hot Dog', quantity: 10 }]);

    expect(post).not.toHaveBeenCalled();
  });

  it('releases the claim when the restock request ultimately fails', async () => {
    const query = vi.fn().mockResolvedValue([{ quantity: 5, capacity: 50, wasInsufficient: false }]);
    const update = vi.fn().mockResolvedValue({ affected: 1 });
    const stockRepo = createStockRepo({ query, update });
    const post = vi.fn().mockReturnValue(throwError(() => new Error('warehouse down')));
    const service = new StockService(stockRepo, createHttp(post), createConfig(), metrics);

    await expect(
      service.reserve('terminal-a', [{ name: 'Hot Dog', quantity: 1 }]),
    ).resolves.toEqual({ inventoryIssue: false });

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        { terminalId: 'terminal-a', itemName: 'Hot Dog' },
        { restockPending: false },
      );
    });
  });

  it('completeRestock() sets the delivered quantity and clears the pending flag', async () => {
    const stockRepo = createStockRepo();
    const service = new StockService(stockRepo, createHttp(vi.fn()), createConfig(), metrics);

    await service.completeRestock('terminal-a', 'Hot Dog', 50);

    expect(stockRepo.update).toHaveBeenCalledWith(
      { terminalId: 'terminal-a', itemName: 'Hot Dog' },
      { quantity: 50, restockPending: false },
    );
  });
});
