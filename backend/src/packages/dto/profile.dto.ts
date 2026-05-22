import { PackageManifest } from './manifest.dto';

/**
 * Summary entry returned by the profile list endpoint.
 * Excludes the full manifest body — clients fetch that separately.
 */
export interface PackageProfileSummary {
  id: string;
  /** Display label (manifest.agentName ?? manifest.name). */
  label: string;
  description?: string;
  hasThumbnail: boolean;
  updatedAt: string;
}

/**
 * Persisted profile: a saved manifest + filesystem metadata.
 * Backed by <PACKAGE_PROFILE_REPOSITORY>/<id>/manifest.json.
 */
export interface PackageProfile {
  id: string;
  manifest: PackageManifest;
  description?: string;
  updatedAt: string;
}
