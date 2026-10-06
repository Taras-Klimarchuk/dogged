import { Injectable } from '@nestjs/common';

@Injectable()
export class MenuService {
  getMenu() {
    return {
      items: [
        {
          name: 'Hot Dog',
          price: 1.99,
        },
      ],
    };
  }
}
