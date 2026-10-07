import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createRetryTimeoutPolicy } from '@app/resilience';
import { MenuCacheService, MenuItem } from './menu-cache.service.js';
import { MenuResponseDto } from './menu-response.dto.js';

const DEFAULT_MENU: MenuItem[] = [{ name: 'Hot Dog', price: 1.99 }];

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);
  private readonly foregroundPolicy = createRetryTimeoutPolicy();
  private readonly recoveryPolicy = createRetryTimeoutPolicy({
    maxAttempts: Infinity,
  });
  private recovering = false;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly cache: MenuCacheService,
  ) {}

  async getMenu(): Promise<MenuResponseDto> {
    try {
      const items = await this.foregroundPolicy.execute(() =>
        this.fetchLiveMenu(),
      );
      this.cache.saveMenu(items);
      return { items, source: 'live' };
    } catch (error) {
      this.logger.warn(
        `menu fetch failed after retries, falling back: ${(error as Error).message}`,
      );
      this.startBackgroundRecovery();

      const cached = this.cache.getCachedMenu();
      return cached
        ? { items: cached.items, source: 'cache' }
        : { items: DEFAULT_MENU, source: 'default' };
    }
  }

  private startBackgroundRecovery(): void {
    if (this.recovering) {
      return;
    }
    this.recovering = true;

    this.recoveryPolicy
      .execute(() => this.fetchLiveMenu())
      .then((items) => {
        this.cache.saveMenu(items);
        this.logger.log('background recovery succeeded, cache updated');
      })
      .catch((error) => {
        this.logger.error(
          `background recovery gave up: ${(error as Error).message}`,
        );
      })
      .finally(() => {
        this.recovering = false;
      });
  }

  private async fetchLiveMenu(): Promise<MenuItem[]> {
    const baseUrl = this.config.get<string>(
      'ORDERS_MANAGEMENT_URL',
      'http://localhost:3001',
    );
    const response = await firstValueFrom(
      this.http.get<{ items: MenuItem[] }>(`${baseUrl}/menu`),
    );
    return response.data.items;
  }
}
