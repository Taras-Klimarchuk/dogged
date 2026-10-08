import { ApiProperty } from '@nestjs/swagger';

export class OrderResponseDto {
  @ApiProperty({ example: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d' })
  orderId: string;

  @ApiProperty({ enum: ['accepted'] })
  status: 'accepted';

  @ApiProperty({
    nullable: true,
    example: null,
    description:
      'Set when the terminal did not have enough stock for one or more items. ' +
      'The order is still accepted either way.',
  })
  inventoryWarning: string | null;
}
