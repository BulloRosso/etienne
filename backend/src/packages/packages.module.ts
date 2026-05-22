import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { PackageResolverService } from './resolver/package-resolver.service';
import { PackageMaterializerService } from './materializer/package-materializer.service';
import { PackageBuilderService } from './builder/package-builder.service';
import { PackageProfilesService } from './profiles/package-profiles.service';
import { SkillsModule } from '../skills/skills.module';
import { SubagentsModule } from '../subagents/subagents.module';
import { AgentRoleRegistryModule } from '../agent-role-registry/agent-role-registry.module';
import { A2ASettingsModule } from '../a2a-settings/a2a-settings.module';
import { ApplicationTypesModule } from '../application-types/application-types.module';
import { CodingAgentConfigurationModule } from '../coding-agent-configuration/coding-agent-configuration.module';
import { McpRegistryModule } from '../mcp-registry/mcp-registry.module';
import { McpServerConfigService } from '../claude/mcpserverconfig/mcp.server.config';

/**
 * Agent Package Composer module.
 *
 * Composes the five central catalogs (skills, subagents, MCP servers,
 * application types, project templates) into a reproducible package
 * (manifest + lockfile + materialized .claude tree).
 *
 * Exports PackageMaterializerService so ProjectsModule can call it from the
 * existing project-creation flow, ensuring wizard and composer share one
 * materialization path.
 */
@Module({
  imports: [
    SkillsModule,
    SubagentsModule,
    AgentRoleRegistryModule,
    A2ASettingsModule,
    ApplicationTypesModule,
    CodingAgentConfigurationModule,
    // McpRegistryModule is `forRoot`-configured at app level — re-importing
    // here would re-create providers. Rely on the global registration in
    // AppModule and inject McpRegistryService where needed.
  ],
  controllers: [PackagesController],
  providers: [
    PackagesService,
    PackageResolverService,
    PackageMaterializerService,
    PackageBuilderService,
    PackageProfilesService,
    McpServerConfigService,
  ],
  exports: [PackageMaterializerService, PackageResolverService],
})
export class PackagesModule {}
