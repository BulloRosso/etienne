import { Module } from '@nestjs/common';
import { GuardrailsController } from './guardrails.controller';
import { GuardrailsService } from './guardrails.service';

@Module({
  controllers: [GuardrailsController],
  providers: [GuardrailsService],
  exports: [GuardrailsService],
})
export class GuardrailsModule {}
