import { Global, Module } from '@nestjs/common';
import { SpeciesConfigService } from './species-config.service';

/**
 * Global because reproductive constants are read from breeding, animals,
 * production and the nightly generators alike; importing it everywhere would
 * be noise.
 */
@Global()
@Module({
  providers: [SpeciesConfigService],
  exports: [SpeciesConfigService],
})
export class SpeciesConfigModule {}
