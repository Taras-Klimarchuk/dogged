import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service.js';
import { Registry } from '@prometheus-io/client';
import { MetricsController } from './metrics.controller.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';

@Module({
  providers: [
    MetricsService,
    { provide: Registry, useValue: new Registry() },
    // APP_INTERCEPTOR applies the interceptor to every route of the host app.
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
  controllers: [MetricsController],
})
export class MetricsModule {}
