import { Global, Module } from '@nestjs/common';
import { SpeciesConfigController } from './species-config.controller';
import { SpeciesConfigService } from './species-config.service';

/**
 * Global because reproductive constants are read from breeding, animals,
 * production and the nightly generators alike; importing it everywhere would
 * be noise.
 */
@Global()
@Module({
  controllers: [SpeciesConfigController],
  providers: [SpeciesConfigService],
  exports: [SpeciesConfigService],
})
export class SpeciesConfigModule {}
