import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class RestockCallbackDto {
  @ApiProperty({ example: 'terminal-a' })
  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @ApiProperty({ example: 'Hot Dog' })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(0)
  quantity: number;
}
