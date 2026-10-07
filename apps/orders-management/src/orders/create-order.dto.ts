import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ example: 'Hot Dog' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description:
      'Idempotency key supplied by the caller. Replaying the same key returns ' +
      'the original order instead of creating a duplicate.',
    example: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ type: [OrderItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
