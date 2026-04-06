# Cloud IAM Authentication Setup

This document explains how to configure the application to use cloud identity providers instead of the built-in local OAuth server.

## Overview

The application supports three authentication providers, selected via the `AUTH_PROVIDER` environment variable in `backend/.env`:

| Provider | Value | Description |
|----------|-------|-------------|
| Local OAuth | `local` (default) | Built-in username/password authentication via the oauth-server process |
| Azure Entra ID | `azure-entraid` | Microsoft Entra ID (formerly Azure AD) via OpenID Connect |
| AWS Cognito | `aws-cognito` | Amazon Cognito User Pools via OpenID Connect |

When a cloud provider is selected, the local oauth-server process is **not started** — the NestJS backend handles all authentication directly.

---

## Architecture

### Token Flow (Cloud Providers)

```
┌──────────┐    GET /auth/authorize    ┌──────────┐
│ Frontend │ ─────────────────────────> │ Backend  │
│          │ <───── { url }            │ (NestJS) │
│          │                           └──────────┘
│          │
│          │──── redirect ────> ┌──────────────┐
│          │                    │ Cloud IdP    │
│          │                    │ (Entra/      │
│          │                    │  Cognito)    │
│          │<── callback ──────│              │
│          │  ?code=...        └──────────────┘
│          │
│          │    GET /auth/callback      ┌──────────┐
│ (browser │ ─── ?code=&state= ───────> │ Backend  │
│ redirect)│                            │          │
│          │                            │ 1. Exchange code with IdP
│          │                            │ 2. Decode id_token
│          │                            │ 3. Map groups → role
│          │                            │ 4. Mint local JWT
│          │                            │ 5. Store under one-time code
│          │<── redirect /?auth_code=   │          │
│          │                            └──────────┘
│          │
│          │  POST /auth/exchange-      ┌──────────┐
│          │   callback-code            │ Backend  │
│          │ ──────────────────────────>│          │
│          │ <── { accessToken,         │          │
│          │      refreshToken, user }  └──────────┘
└──────────┘
```

**Key point:** After the code exchange, the backend mints its own JWTs using the same secret and format as the local oauth-server. This means downstream services (the backend's `JwtAuthGuard`) validate tokens identically regardless of the original identity provider.

### Token Format (all providers)

```json
{
  "sub": "user-id",
  "username": "user@example.com",
  "role": "user",
  "displayName": "John Doe",
  "type": "access",
  "iat": 1700000000,
  "exp": 1700000900
}
```

---

## Azure Entra ID Setup

### 1. Create an App Registration

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations** > **New registration**
2. Name: e.g. `claude-multitenant`
3. Supported account types: Choose based on your organization (typically **Single tenant**)
4. Redirect URI: Select **Web** and enter your callback URL:
   - Development: `http://localhost:6060/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
5. Click **Register**

### 2. Configure the App

1. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page
2. Go to **Certificates & secrets** > **New client secret**
   - Store the secret value in your secrets-manager (recommended) or in `AZURE_ENTRAID_CLIENT_SECRET`
3. Go to **API permissions** > **Add a permission**:
   - Microsoft Graph > Delegated permissions:
     - `openid`
     - `profile`
     - `email`
   - Click **Grant admin consent** if required

### 3. Configure Group-Based Role Mapping (Optional)

To map Azure AD group memberships to application roles:

1. Go to **Token configuration** > **Add groups claim**
   - Select **Security groups** (or **All groups** depending on your needs)
2. Note the **Object IDs** of the groups you want to map to the `admin` role
3. Set `AZURE_ENTRAID_ADMIN_GROUPS` to a comma-separated list of those group IDs

For group-based role mapping to work, you also need the `GroupMember.Read.All` permission (or `User.Read` with group membership included in tokens).

### 4. Environment Variables

```env
AUTH_PROVIDER=azure-entraid
AZURE_ENTRAID_TENANT_ID=<directory-tenant-id>
AZURE_ENTRAID_CLIENT_ID=<application-client-id>
AZURE_ENTRAID_CLIENT_SECRET=<client-secret-value>
AZURE_ENTRAID_REDIRECT_URI=http://localhost:6060/auth/callback
AZURE_ENTRAID_ADMIN_GROUPS=<group-id-1>,<group-id-2>
```

> **Security note:** Store `AZURE_ENTRAID_CLIENT_SECRET` in your secrets-manager (Azure Key Vault or OpenBao) rather than directly in the `.env` file.

---

## AWS Cognito Setup

### 1. Create a User Pool

1. Go to [AWS Console](https://console.aws.amazon.com) > **Amazon Cognito** > **Create user pool**
2. Configure sign-in:
   - Sign-in identifiers: **Email**
   - Multi-factor authentication: Configure as needed
3. Configure sign-up:
   - Required attributes: `email`, `name`
4. Configure message delivery: Choose email provider
5. App integration:
   - User pool name: e.g. `claude-multitenant`

### 2. Create an App Client

1. In your User Pool > **App integration** > **Create app client**
2. App type: **Confidential client**
3. App client name: e.g. `claude-multitenant-web`
4. Generate a client secret
5. Store the secret in your secrets-manager (recommended)

### 3. Configure a Domain

1. In your User Pool > **App integration** > **Domain**
2. Choose a Cognito domain: `https://<your-prefix>.auth.<region>.amazoncognito.com`
   - Or configure a custom domain

### 4. Configure Hosted UI

1. In your app client > **Hosted UI** > **Edit**
2. Allowed callback URLs:
   - Development: `http://localhost:6060/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
3. Allowed sign-out URLs: `http://localhost:5000`
4. OAuth 2.0 grant types: **Authorization code grant**
5. OpenID Connect scopes: `openid`, `profile`, `email`

### 5. Configure Group-Based Role Mapping (Optional)

1. In your User Pool > **Groups** > **Create group**
2. Create groups like `admins`, `users`
3. Add users to the appropriate groups
4. Set `AWS_COGNITO_ADMIN_GROUPS` to the Cognito group names that should receive the `admin` role

Cognito includes group memberships in the `cognito:groups` claim of the id_token automatically.

### 6. Environment Variables

```env
AUTH_PROVIDER=aws-cognito
AWS_COGNITO_USER_POOL_ID=<region>_<pool-id>
AWS_COGNITO_CLIENT_ID=<app-client-id>
AWS_COGNITO_CLIENT_SECRET=<app-client-secret>
AWS_COGNITO_REGION=<aws-region>
AWS_COGNITO_DOMAIN=<your-prefix>.auth.<region>.amazoncognito.com
AWS_COGNITO_ADMIN_GROUPS=admins
```

> **Security note:** Store `AWS_COGNITO_CLIENT_SECRET` in your secrets-manager (AWS Secrets Manager or OpenBao) rather than directly in the `.env` file.

---

## Secrets Manager Integration

The cloud auth providers are designed to work with the existing secrets-manager infrastructure. The recommended setup:

| Deployment | Secrets Manager | Auth Provider |
|-----------|----------------|---------------|
| Local dev | OpenBao (`openbao`) | Local (`local`) |
| Azure cloud | Azure Key Vault (`azure-keyvault`) | Azure Entra ID (`azure-entraid`) |
| AWS cloud | AWS Secrets Manager (`aws`) | AWS Cognito (`aws-cognito`) |
| Hybrid | Any combination is supported | Any provider |

Note that the secrets-manager env vars (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, etc.) and the auth provider env vars (`AZURE_ENTRAID_TENANT_ID`, `AZURE_ENTRAID_CLIENT_ID`, etc.) are **intentionally separate**. This allows configurations like using Azure Key Vault for secrets while using local authentication, or vice versa.

---

## Role Mapping

All cloud-authenticated users receive a default role of `user`. To grant `admin` access:

| Provider | Env Variable | Value Format |
|----------|-------------|--------------|
| Azure Entra ID | `AZURE_ENTRAID_ADMIN_GROUPS` | Comma-separated Azure AD group **Object IDs** |
| AWS Cognito | `AWS_COGNITO_ADMIN_GROUPS` | Comma-separated Cognito **group names** |

Users not matching any admin group receive the `user` role. The `guest` role is not assigned via cloud providers — use it only with the local oauth-server.

---

## Redirect URI Configuration

The redirect URI must match **exactly** between your cloud provider configuration and the `*_REDIRECT_URI` environment variable.

| Environment | Redirect URI |
|------------|-------------|
| Local development | `http://localhost:6060/auth/callback` |
| Docker Compose | `http://localhost:6060/auth/callback` |
| Production (behind reverse proxy) | `https://your-domain.com/auth/callback` |

The `/auth/callback` path is handled by the backend's auth gateway controller.

---

## Troubleshooting

### "OAuth server unavailable" with AUTH_PROVIDER=local
The backend proxies `/auth/*` requests to `http://localhost:5950`. Ensure the oauth-server process is running.

### "Invalid or expired state parameter"
The OIDC state parameter has a 5-minute TTL. If the user takes too long to authenticate at the cloud IdP, they'll see this error. They can retry by clicking the login button again.

### "Code exchange failed"
Check that:
- The client secret is correct and not expired
- The redirect URI matches exactly between the cloud provider config and the env variable
- Network connectivity to the cloud IdP token endpoint is available

### Users always get "user" role despite being in admin groups
- **Azure:** Ensure `AZURE_ENTRAID_ADMIN_GROUPS` contains the group **Object IDs** (GUIDs), not display names
- **AWS:** Ensure `AWS_COGNITO_ADMIN_GROUPS` contains the exact Cognito group names (case-sensitive)
- **Azure:** Verify that group claims are included in the token (Token configuration > Groups claim)

### Password change not available
Password management is only available with `AUTH_PROVIDER=local`. For cloud providers, users must change their password through the respective identity provider portal (Azure AD or Cognito).
