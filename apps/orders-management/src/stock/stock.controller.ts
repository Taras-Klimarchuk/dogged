import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service.js';
import { RestockCallbackDto } from './restock-callback.dto.js';

@ApiTags('stock')
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('restock-callback')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Called by warehouse once a previously requested restock has actually been delivered.',
  })
  @ApiOkResponse()
  completeRestock(@Body() dto: RestockCallbackDto): Promise<void> {
    return this.stockService.completeRestock(
      dto.terminalId,
      dto.itemName,
      dto.quantity,
    );
  }
}
