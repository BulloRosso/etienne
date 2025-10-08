import { Module } from '@nestjs/common';
import { OutputGuardrailsController } from './output-guardrails.controller';
import { OutputGuardrailsService } from './output-guardrails.service';

@Module({
  controllers: [OutputGuardrailsController],
  providers: [OutputGuardrailsService],
  exports: [OutputGuardrailsService],
})
export class OutputGuardrailsModule {}
