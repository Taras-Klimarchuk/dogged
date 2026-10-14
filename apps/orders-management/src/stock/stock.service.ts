import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { createRetryTimeoutBreakerPolicy, isRetryableHttpError } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import { TerminalStock } from './terminal-stock.entity.js';
import type { OrderItem } from '../orders/order.entity.js';

const DEFAULT_CAPACITY = 50;
const REORDER_THRESHOLD_RATIO = 0.3;

export interface ReserveResult {
  inventoryIssue: boolean;
}

interface DecrementRow {
  quantity: number;
  capacity: number;
  wasInsufficient: boolean;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    @InjectRepository(TerminalStock)
    private readonly stock: Repository<TerminalStock>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
      isRetryable: isRetryableHttpError,
      ...metrics.breakerHooks('warehouse-restock'),
    });
  }

  async reserve(terminalId: string, items: OrderItem[]): Promise<ReserveResult> {
    let inventoryIssue = false;

    for (const item of items) {
      const row = await this.decrement(terminalId, item.name, item.quantity);

      if (row.wasInsufficient) {
        inventoryIssue = true;
      }
      if (row.quantity < row.capacity * REORDER_THRESHOLD_RATIO) {
        await this.requestRestockIfNeeded(terminalId, item.name);
      }
    }

    return { inventoryIssue };
  }

  // A single atomic UPDATE, rather than the read-then-write-back approach
  private async decrement(
    terminalId: string,
    itemName: string,
    requested: number,
  ): Promise<DecrementRow> {
    const rows: DecrementRow[] = await this.stock.query(
      `
        WITH before AS (
          SELECT quantity FROM terminal_stock
          WHERE "terminalId" = $1 AND "itemName" = $2
        ),
        updated AS (
          UPDATE terminal_stock
          SET quantity = GREATEST(quantity - $3, 0)
          WHERE "terminalId" = $1 AND "itemName" = $2
          RETURNING quantity, capacity
        )
        SELECT updated.quantity, updated.capacity, (before.quantity < $3) AS "wasInsufficient"
        FROM updated, before
      `,
      [terminalId, itemName, requested],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        `terminal "${terminalId}" has no stock entry for "${itemName}"`,
      );
    }
    return row;
  }

  private async requestRestockIfNeeded(
    terminalId: string,
    itemName: string,
  ): Promise<void> {
    const claim = await this.stock.update(
      { terminalId, itemName, restockPending: false },
      { restockPending: true },
    );
    if (!claim.affected) {
      return;
    }

    this.policy
      .execute(() => this.sendRestockRequest(terminalId, itemName))
      .then(() => {
        this.logger.log(`restock requested terminalId=${terminalId} item=${itemName}`);
      })
      .catch(async (error) => {
        this.logger.warn(
          `restock request failed terminalId=${terminalId} item=${itemName}: ${(error as Error).message}`,
        );
        // release the claim so the next low-stock check can try again
        await this.stock.update({ terminalId, itemName }, { restockPending: false });
      });
  }

  // Warehouse calls this once a previously requested restock actually lands.
  async completeRestock(
    terminalId: string,
    itemName: string,
    quantity: number,
  ): Promise<void> {
    await this.stock.update(
      { terminalId, itemName },
      { quantity, restockPending: false },
    );
  }

  private async sendRestockRequest(
    terminalId: string,
    itemName: string,
  ): Promise<void> {
    const baseUrl = this.config.get<string>(
      'WAREHOUSE_URL',
      'http://localhost:3002',
    );
    await firstValueFrom(
      this.http.post(`${baseUrl}/restock`, {
        terminalId,
        itemName,
        upToCapacity: DEFAULT_CAPACITY,
      }),
    );
  }
}
