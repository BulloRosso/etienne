import { Provider } from '@nestjs/common';
import { AnthropicKeyCheck } from './anthropic-key.check';
import { AnthropicNetworkCheck } from './anthropic-network.check';
import { ClaudeSdkInstalledCheck } from './claude-sdk.check';
import { EmbeddingsCheck } from './embeddings.check';
import { FrontendReachableCheck } from './frontend-reachable.check';
import { NodeVersionCheck } from './node-version.check';
import { OauthReachableCheck } from './oauth-reachable.check';
import { PortsCheck } from './ports.check';
import { PythonCheck } from './python.check';
import { SofficeCheck } from './soffice.check';
import { UvCheck } from './uv.check';
import { DiskFreeCheck, WorkspaceCheck } from './workspace.check';

export const CHECK_PROVIDERS: Provider[] = [
  AnthropicKeyCheck,
  AnthropicNetworkCheck,
  ClaudeSdkInstalledCheck,
  EmbeddingsCheck,
  FrontendReachableCheck,
  NodeVersionCheck,
  OauthReachableCheck,
  PortsCheck,
  PythonCheck,
  SofficeCheck,
  UvCheck,
  WorkspaceCheck,
  DiskFreeCheck,
];

export const CHECK_CLASSES = [
  AnthropicKeyCheck,
  AnthropicNetworkCheck,
  ClaudeSdkInstalledCheck,
  EmbeddingsCheck,
  FrontendReachableCheck,
  NodeVersionCheck,
  OauthReachableCheck,
  PortsCheck,
  PythonCheck,
  SofficeCheck,
  UvCheck,
  WorkspaceCheck,
  DiskFreeCheck,
] as const;

// Legacy alias used by the runner — kept for compatibility with internal imports
export const CHECK_REGISTRY = CHECK_CLASSES;
