# Secrets Manager

Pluggable secret-storage abstraction for the backend. Secrets are accessed through a single `SecretsManagerService` that delegates to a configurable provider and falls back to environment variables when the primary provider is unavailable.

## Providers

Set `SECRET_VAULT_PROVIDER` in `.env` to choose the active provider.

| Value | Provider | Description |
|---|---|---|
| `openbao` (default) | OpenBaoProvider | HashiCorp Vault-compatible store (OpenBao) running on port 8200 |
| `azure-keyvault` | AzureKeyVaultProvider | Azure Key Vault via `@azure/identity` / `@azure/keyvault-secrets` |
| `aws` | AwsSecretsManagerProvider | AWS Secrets Manager via `@aws-sdk/client-secrets-manager` |
| `env` | EnvProvider | Reads/writes `process.env` directly (no external service) |

The **EnvProvider** always acts as fallback: if the primary provider is unreachable, `getSecret()` and `listSecrets()` transparently retry against `process.env`.

## Configuration

### OpenBao (default)

```env
SECRET_VAULT_PROVIDER=openbao
OPENBAO_ADDR=http://127.0.0.1:8200
OPENBAO_DEV_ROOT_TOKEN=dev-root-token
```

### Azure Key Vault

```env
SECRET_VAULT_PROVIDER=azure-keyvault
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>
AZURE_VAULT_URL=https://<vault-name>.vault.azure.net
```

The Azure provider authenticates with a service principal (`ClientSecretCredential`). Each app secret is stored as its own Key Vault secret. Since Key Vault names only allow alphanumeric characters and hyphens, underscores are translated automatically:

- `ANTHROPIC_API_KEY` is stored as `ANTHROPIC-API-KEY`
- `JWT_SECRET` is stored as `JWT-SECRET`

### AWS Secrets Manager

```env
SECRET_VAULT_PROVIDER=aws
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
# Optional: prefix to namespace secrets (e.g. 'myapp' stores keys as 'myapp/KEY_NAME')
AWS_SECRETS_PREFIX=
```

The AWS provider uses IAM credentials to authenticate. Each app secret is stored as its own Secrets Manager secret. Secret names are used as-is (no translation needed). The optional `AWS_SECRETS_PREFIX` namespaces keys with a path separator (e.g. `myapp/ANTHROPIC_API_KEY`).

### Environment only

```env
SECRET_VAULT_PROVIDER=env
```

No additional configuration needed. Secrets are read from and written to `process.env`.

## REST API

All endpoints require the `user` role.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/secrets-manager` | List all secret keys |
| `GET` | `/api/secrets-manager/:key` | Get a secret value |
| `PUT` | `/api/secrets-manager/:key` | Set a secret (`{ "value": "..." }`) |
| `DELETE` | `/api/secrets-manager/:key` | Delete a secret |

## Architecture

```
SecretsManagerService
  |
  +-- provider (selected by SECRET_VAULT_PROVIDER)
  |     +-- OpenBaoProvider
  |     +-- AzureKeyVaultProvider
  |     +-- AwsSecretsManagerProvider
  |     +-- EnvProvider
  |
  +-- fallback (always EnvProvider)
```

### Adding a new provider

1. Create `providers/<name>.provider.ts` implementing `ISecretProvider`
2. Register it in `secrets-manager.module.ts`
3. Inject it in `secrets-manager.service.ts` and add a selection branch
4. Add the corresponding env vars to `.env.template`
