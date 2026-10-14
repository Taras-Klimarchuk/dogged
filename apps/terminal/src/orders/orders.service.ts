import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { createRetryTimeoutBreakerPolicy, isRetryableHttpError } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import { CreateOrderDto } from './create-order.dto.js';
import { OrderResponseDto } from './order-response.dto.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
      initialDelayMs: 1000,
      isRetryable: isRetryableHttpError,
      ...metrics.breakerHooks('orders-management-order'),
    });
  }

  async placeOrder(order: CreateOrderDto): Promise<OrderResponseDto> {
    try {
      return await this.policy.execute(() => this.submitOrder(order));
    } catch (error) {
      if (isAxiosError(error) && error.response && error.response.status < 500) {
        this.logger.warn(
          `order rejected by orders-management (${error.response.status}), idempotencyKey=${order.idempotencyKey}`,
        );
        throw new HttpException(error.response.data, error.response.status);
      }

      this.logger.warn(
        `order submission failed, idempotencyKey=${order.idempotencyKey}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'orders-management is unavailable, please try again later',
      );
    }
  }

  private async submitOrder(order: CreateOrderDto): Promise<OrderResponseDto> {
    const baseUrl = this.config.get<string>(
      'ORDERS_MANAGEMENT_URL',
      'http://localhost:3001',
    );
    const terminalId = this.config.get<string>('TERMINAL_ID', 'terminal-dev');
    const response = await firstValueFrom(
      this.http.post<OrderResponseDto>(`${baseUrl}/orders`, {
        idempotencyKey: order.idempotencyKey,
        items: order.items,
        terminalId,
      }),
    );
    return response.data;
  }
}
