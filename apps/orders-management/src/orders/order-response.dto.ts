import { ApiProperty } from '@nestjs/swagger';

export class OrderResponseDto {
  @ApiProperty({ example: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d' })
  orderId: string;

  @ApiProperty({ enum: ['accepted'] })
  status: 'accepted';
}
