// OpenTelemetry instrumentation MUST be imported first
import './observability/instrumentation';

import 'reflect-metadata';
import 'dotenv/config';
import * as http from 'http';
import * as https from 'https';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedocModule } from '@jozefazz/nestjs-redoc';
import { AppModule } from './app.module';

// Increase default socket limits so long-running requests (e.g. image generation)
// don't block other outbound HTTP connections
http.globalAgent.maxSockets = 50;
https.globalAgent.maxSockets = 50;

async function bootstrap() {
  // In Foundry mode the backend is only reachable via the adapter proxy
  // on localhost — CORS is handled by the adapter on port 8088. For
  // standard mode the frontend dev server runs on localhost:5000.
  const corsOrigin = process.env.FOUNDRY_ENABLED === 'true'
    ? true   // allow any origin (only localhost can reach :6060)
    : (process.env.FOUNDRY_FRONTEND_ORIGIN || 'http://localhost:5000');
  const app = await NestFactory.create(AppModule, {
    cors: { origin: corsOrigin, credentials: true, exposedHeaders: ['mcp-session-id'] },
    bodyParser: false,
  });
  const bodyParser = require('body-parser');
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
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
