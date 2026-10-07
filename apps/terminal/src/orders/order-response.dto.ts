import { ApiProperty } from '@nestjs/swagger';

export class OrderResponseDto {
  @ApiProperty({ example: 'f3c1d2a4-6b8a-4e9a-8c1a-2d3e4f5a6b7c' })
  orderId: string;

  @ApiProperty({ enum: ['accepted'] })
  status: 'accepted';
}
