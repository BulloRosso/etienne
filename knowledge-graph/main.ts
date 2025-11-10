import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Knowledge Graph + Vector Search API')
    .setDescription('API for combining Knowledge Graphs with Vector Search')
    .setVersion('1.0')
    .addTag('vector-store', 'Vector embedding operations')
    .addTag('knowledge-graph', 'Knowledge graph operations')
    .addTag('search', 'Hybrid search operations')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log('Swagger docs available at: http://localhost:3000/api');
}
bootstrap();
