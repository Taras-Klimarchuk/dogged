import { Injectable } from '@nestjs/common';

@Injectable()
export class OrdersService {
  placeOrder() {
    return {
      orderId: '12345',
    };
  }
}
