import { Module } from '@nestjs/common';
import { McpRegistryService } from './mcp-registry.service';
import { McpRegistryController } from './mcp-registry.controller';

@Module({
  controllers: [McpRegistryController],
  providers: [McpRegistryService],
  exports: [McpRegistryService],
})
export class McpRegistryModule {}
