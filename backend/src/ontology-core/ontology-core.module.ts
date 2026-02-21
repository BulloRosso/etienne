import { Module } from '@nestjs/common';
import { DecisionSupportService } from './decision-support.service';
import { DecisionSupportController } from './decision-support.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { EventHandlingModule } from '../event-handling/event-handling.module';

@Module({
  imports: [KnowledgeGraphModule, EventHandlingModule],
  controllers: [DecisionSupportController],
  providers: [DecisionSupportService],
  exports: [DecisionSupportService],
})
export class OntologyCoreModule {}
