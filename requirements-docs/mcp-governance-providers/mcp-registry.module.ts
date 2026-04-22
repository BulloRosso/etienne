import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  McpRegistryService,
  MCP_PROVIDERS,
  MCP_SECRET_RESOLVER,
} from './core/mcp-registry.service';
import { IMcpRegistryProvider } from './core/provider.interface';
import {
  SecretResolverChain,
  EnvSecretResolver,
  AzureKeyVaultSecretResolver,
  ISecretResolver,
} from './secrets/secret-resolver';
import {
  JsonFileRegistryProvider,
  JsonFileProviderOptions,
} from './providers/json-file.provider';
import {
  AzureApiCenterProvider,
  AzureApiCenterProviderOptions,
} from './providers/azure-api-center.provider';
import {
  ComposioProvider,
  ComposioProviderOptions,
} from './providers/composio.provider';
import {
  AwsBedrockAgentCoreProvider,
  AwsBedrockAgentCoreProviderOptions,
} from './providers/aws-bedrock-agentcore.provider';

export interface McpRegistryModuleOptions {
  /** Providers to compose, in priority order (last wins on name collision). */
  providers: Array<
    | { kind: 'json-file'; options?: JsonFileProviderOptions }
    | { kind: 'azure-api-center'; options: AzureApiCenterProviderOptions }
    | { kind: 'composio'; options: ComposioProviderOptions }
    | {
        kind: 'aws-bedrock-agentcore';
        options: AwsBedrockAgentCoreProviderOptions;
      }
    | { kind: 'custom'; instance: IMcpRegistryProvider }
  >;
  secrets?: {
    /** Azure Key Vault URL, e.g. `https://myvault.vault.azure.net`. */
    keyVaultUrl?: string;
    /** Extra resolvers (AWS Secrets Manager, HashiCorp Vault, etc.). */
    extraResolvers?: ISecretResolver[];
    /** Cache TTL for Key Vault secrets. Defaults to 5 minutes. */
    keyVaultTtlMs?: number;
  };
}

@Module({})
export class McpRegistryModule {
  static forRoot(options: McpRegistryModuleOptions): DynamicModule {
    const providersList: IMcpRegistryProvider[] = options.providers.map((cfg) => {
      switch (cfg.kind) {
        case 'json-file':
          return new JsonFileRegistryProvider(cfg.options ?? {});
        case 'azure-api-center':
          return new AzureApiCenterProvider(cfg.options);
        case 'composio':
          return new ComposioProvider(cfg.options);
        case 'aws-bedrock-agentcore':
          return new AwsBedrockAgentCoreProvider(cfg.options);
        case 'custom':
          return cfg.instance;
      }
    });

    const resolvers: ISecretResolver[] = [new EnvSecretResolver()];
    if (options.secrets?.keyVaultUrl) {
      resolvers.push(
        new AzureKeyVaultSecretResolver(
          options.secrets.keyVaultUrl,
          options.secrets.keyVaultTtlMs,
        ),
      );
    }
    if (options.secrets?.extraResolvers) {
      resolvers.push(...options.secrets.extraResolvers);
    }
    const secretChain = new SecretResolverChain(resolvers);

    const providers: Provider[] = [
      { provide: MCP_PROVIDERS, useValue: providersList },
      { provide: MCP_SECRET_RESOLVER, useValue: secretChain },
      McpRegistryService,
    ];

    return {
      module: McpRegistryModule,
      providers,
      exports: [McpRegistryService],
      global: true,
    };
  }
}
