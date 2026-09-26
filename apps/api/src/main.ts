import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createFarmApp } from './create-app';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const { app, port } = await createFarmApp();

  const config = new DocumentBuilder()
    .setTitle('Farm Management API')
    .setDescription('Farm Management web dashboard API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  // Bind all interfaces so Expo Go on a phone/emulator can reach the API on LAN.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on 0.0.0.0:${port} (${env.NODE_ENV})`);
}

void bootstrap();
