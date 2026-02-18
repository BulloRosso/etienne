// OpenTelemetry instrumentation MUST be imported first
import './observability/instrumentation';

import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedocModule } from '@jozefazz/nestjs-redoc';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: 'http://localhost:5000' } });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Claude Multi-Tenant API')
    .setDescription('API for managing isolated Claude Code projects in a central workspace')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'Bearer', bearerFormat: 'JWT', in: 'Header' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  await RedocModule.setup('/docs', app, document, {
    title: 'Claude Multi-Tenant API',
    sortPropsAlphabetically: true,
    hideDownloadButton: false,
    hideHostname: false,
    noAutoAuth: true,
    pathInMiddlePanel: true,
  });

  await app.listen(6060);
}
bootstrap();
