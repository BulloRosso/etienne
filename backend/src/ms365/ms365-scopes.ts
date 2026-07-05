/**
 * Single source of truth for the delegated Microsoft Graph scopes requested
 * by the per-project MS365 connection (auth-code flow and refresh-token grant).
 *
 * Teams scopes power the Teams channel observer (teams-channel-sync.service.ts):
 * - Team.ReadBasic.All / Channel.ReadBasic.All — team & channel pickers
 * - ChannelMessage.Read.All — read channel messages/replies/hosted content
 *   (requires tenant-admin consent in the Entra app registration)
 *
 * Note: existing project connections were consented with the old scope set and
 * must be re-connected (/api/ms365/:project/connect) to pick up new scopes.
 * A deployment overriding MS365_SCOPES must include the Teams scopes itself.
 */
export const MS365_DEFAULT_SCOPES =
  'offline_access Files.ReadWrite.All Sites.ReadWrite.All User.Read ' +
  'Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All';

export function ms365Scopes(): string {
  return process.env.MS365_SCOPES || MS365_DEFAULT_SCOPES;
}
