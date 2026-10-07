import type { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { MenuService } from './menu.service.js';
import { MenuCacheService } from './menu-cache.service.js';

function createHttpService(get: ReturnType<typeof vi.fn>): HttpService {
  return { get } as unknown as HttpService;
}

function createConfigService(): ConfigService {
  return { get: () => 'http://orders-management:3001' } as unknown as ConfigService;
}

function createCache(): MenuCacheService {
  const config = { get: () => ':memory:' } as unknown as ConfigService;
  return new MenuCacheService(config);
}

describe('MenuService', () => {
  it('returns the live menu and caches it on success', async () => {
    const items = [{ name: 'Hot Dog', price: 1.99 }];
    const get = vi.fn().mockReturnValue(of({ data: { items } }));
    const cache = createCache();
    const service = new MenuService(createHttpService(get), createConfigService(), cache);

    const result = await service.getMenu();

    expect(result).toEqual({ items, source: 'live' });
    expect(cache.getCachedMenu()?.items).toEqual(items);
  });

  it('falls back to the cached menu when orders-management is unreachable', async () => {
    const cache = createCache();
    cache.saveMenu([{ name: 'Hot Dog', price: 1.49 }]);

    const get = vi
      .fn()
      .mockReturnValue(throwError(() => new Error('connection refused')));
    const service = new MenuService(createHttpService(get), createConfigService(), cache);

    const result = await service.getMenu();

    expect(result).toEqual({
      items: [{ name: 'Hot Dog', price: 1.49 }],
      source: 'cache',
    });
  });

  it('falls back to the default menu when unreachable and nothing is cached', async () => {
    const cache = createCache();
    const get = vi
      .fn()
      .mockReturnValue(throwError(() => new Error('connection refused')));
    const service = new MenuService(createHttpService(get), createConfigService(), cache);

    const result = await service.getMenu();

    expect(result.source).toBe('default');
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('recovers in the background and updates the cache once orders-management comes back', async () => {
    const cache = createCache();
    const items = [{ name: 'Hot Dog', price: 1.99 }];
    // foreground policy exhausts 4 calls (1 initial + 3 retries) before falling
    // back; the 5th call is the background recovery loop's first attempt.
    const get = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('down 1')))
      .mockReturnValueOnce(throwError(() => new Error('down 2')))
      .mockReturnValueOnce(throwError(() => new Error('down 3')))
      .mockReturnValueOnce(throwError(() => new Error('down 4')))
      .mockReturnValue(of({ data: { items } }));

    const service = new MenuService(createHttpService(get), createConfigService(), cache);

    const result = await service.getMenu();
    expect(result.source).toBe('default');

    await vi.waitFor(() => {
      expect(cache.getCachedMenu()?.items).toEqual(items);
    });
  });
});
