import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SpeciesConfigDto } from '@farm/contracts';
import { SpeciesConfigService } from './species-config.service';

@ApiTags('species-config')
@Controller('species-config')
export class SpeciesConfigController {
  constructor(private readonly species: SpeciesConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Reproductive constants per species. Never hardcode these.' })
  all(): Promise<SpeciesConfigDto[]> {
    return this.species.all();
  }
}
