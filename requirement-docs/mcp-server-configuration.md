# MCP Server Configuration in Claude Code Developer Images

Claude Code uses **`.mcp.json` files in your project root** for team-shared MCP server configurations, with JSON-formatted settings defining server commands, arguments, and environment variables. When running in developer images, you'll need to mount authentication directories and may require MCP proxy for cross-container communication.

MCP (Model Context Protocol) servers extend Claude Code with capabilities like filesystem access, database queries, and API integrations. This guide covers configuration specifically for containerized environments, based on official Anthropic documentation from docs.claude.com and the Claude Code GitHub repository.

## Configuration file locations and paths

Claude Code supports three configuration scopes, each stored in different locations:

**Project scope (team-shared)**: The `.mcp.json` file in your project root is designed for version control and team sharing. This is the recommended location for developer images since it travels with your codebase. Add servers here with `claude mcp add <server-name> --scope project -- npx -y package-name`.

**User scope (personal, cross-project)**: Stored in `~/.claude/claude.json` for user-wide settings available across all projects. On Linux systems (including developer containers), this may be `~/.config/claude`. In containers, this typically maps to `/home/node/.claude/` or `/home/mambauser/.claude/` depending on your base image. Add servers with `--scope user`.

**Local scope (project-specific, private)**: Stored in project-specific user settings, not shared with team. This is the default when adding servers without specifying scope. Use `--scope local` explicitly.

For developer images specifically, mount these key directories:

```json
{
  "mounts": [
    "source=${localWorkspaceFolder},target=/workspace,type=bind",
    "source=.devcontainer/claude-data,target=/home/node/.claude,type=bind"
  ]
}
```

The authentication mount (`.devcontainer/claude-data`) persists OAuth tokens across container restarts. **Critical**: Add this directory to `.gitignore` to prevent committing credentials.

## Configuration file format and structure

MCP configurations use **JSON format** following a standardized schema. The basic structure defines servers under the `mcpServers` object:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "executable-command",
      "args": ["array", "of", "arguments"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

### Transport-specific structures

**stdio transport** (default for local servers):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {
        "ALLOWED_PATHS": "/workspace"
      }
    }
  }
}
```

**HTTP transport** (for remote servers):
```json
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

**SSE transport** (Server-Sent Events):
```json
{
  "mcpServers": {
    "linear": {
      "type": "sse",
      "url": "https://mcp.linear.app/sse",
      "headers": {
        "Authorization": "Bearer ${LINEAR_TOKEN}"
      }
    }
  }
}
```

The configuration supports **environment variable expansion** using `${VAR}` syntax, with default values via `${VAR:-default}`. This is essential for keeping secrets out of version-controlled files.

## All available configuration options

### Core properties

**`command`** (string, required for stdio): The executable to run the MCP server. Common values include `"npx"`, `"node"`, `"python"`, or `"docker"`.

**`args`** (array of strings, required for stdio): Command-line arguments passed to the server. Example: `["-y", "@modelcontextprotocol/server-github"]`.

**`type`** (string, optional): Transport protocol. Values: `"stdio"` (default), `"http"`, or `"sse"`. Omit for local stdio servers.

**`url`** (string, required for HTTP/SSE): The endpoint URL for remote MCP servers.

**`env`** (object, optional): Environment variables passed to the server process. Supports expansion syntax for referencing shell environment variables.

**`headers`** (object, optional for HTTP/SSE): HTTP headers for authentication and custom metadata. Example: `{"X-API-Key": "${API_KEY}"}`.

### Scope configuration flags

When adding servers via CLI, specify scope with `--scope`:

- **`--scope local`**: Available only to you in the current project (default)
- **`--scope project`**: Shared with team via `.mcp.json` in version control
- **`--scope user`**: Available across all your projects

### Environment variables for Claude Code

**`MAX_MCP_OUTPUT_TOKENS`**: Maximum tokens in MCP tool responses (default: 25,000). Warning displays at 10,000 tokens. Set higher for large data operations: `export MAX_MCP_OUTPUT_TOKENS=50000`.

**`MCP_TIMEOUT`**: Server startup timeout in milliseconds. Increase for slow-starting containers.

**`MCP_TOOL_TIMEOUT`**: Individual tool execution timeout in milliseconds.

**`ANTHROPIC_API_KEY`**: Alternative to OAuth authentication in containers where interactive login is impractical.

**`ANTHROPIC_LOG`**: Set to `"debug"` for verbose MCP logging. Use `claude --mcp-debug` flag for configuration diagnostics.

### CLI configuration commands

```bash
# Add stdio server
claude mcp add <name> -- npx -y @org/server-name

# Add with environment variables
claude mcp add github --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github

# Add HTTP/SSE server
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
claude mcp add --transport sse linear https://mcp.linear.app/sse

# Add from JSON directly
claude mcp add-json puppeteer '{"command":"docker","args":["run","-i","--rm","mcp/puppeteer"]}'

# List configured servers
claude mcp list

# Remove server
claude mcp remove <name>

# Import from Claude Desktop
claude mcp import-from-claude-desktop

# Reset project approval choices
claude mcp reset-project-choices
```

## Container and developer image considerations

Running Claude Code in containers presents specific challenges and solutions not present in local installations.

### MCP server communication across containers

**The critical issue**: stdio-based MCP servers cannot communicate across container boundaries. Most MCP servers use stdio by default, creating a problem when Claude Code runs in one container and needs to communicate with servers in other containers.

**Solution approaches**:

1. **Run MCP servers in the same container** as Claude Code (simplest):
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  }
}
```

2. **Use MCP proxy** to bridge stdio to HTTP/SSE for cross-container communication:
```yaml
services:
  claude-dev:
    build: .
    networks:
      - dev-network
    environment:
      - MCP_PROXY_URL=http://mcp-proxy:8090
    
  mcp-proxy:
    image: ghcr.io/sparfenyuk/mcp-proxy:latest
    networks:
      - dev-network
    command: "--port=8090 --host=0.0.0.0 -- npx -y @modelcontextprotocol/server-github"
```

Then configure Claude Code to use HTTP transport:
```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "http://mcp-proxy:8090"
    }
  }
}
```

3. **Use native HTTP/SSE servers** when available (Sentry, Linear, Notion, Stripe all offer this).

4. **Docker-in-Docker pattern** for containerized MCP servers:
```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--init", "mcp/puppeteer"]
    }
  }
}
```

### Authentication and credential management

Local installations use OAuth flows interactively, but containers require different approaches:

**Volume mount authentication directory** (recommended):
```json
{
  "mounts": [
    "source=.devcontainer/claude-data,target=/home/node/.claude,type=bind"
  ]
}
```

This persists tokens across container lifecycles. Add to `.gitignore`:
```gitignore
.devcontainer/claude-data/
.claude/
dev.env
```

**API key authentication** (alternative):
```dockerfile
ENV ANTHROPIC_API_KEY=sk-ant-your-key
```

Or via compose:
```yaml
environment:
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

### Network security in official devcontainer

Anthropic's reference devcontainer implements **whitelist-only firewall rules** via `init-firewall.sh`. This requires capabilities:

```json
{
  "runArgs": [
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW"
  ]
}
```

Whitelisted domains include npm registry, GitHub, Claude API endpoints. This default-deny approach provides security through isolation.

### File permissions and user mapping

Container users often cause permission conflicts with volume-mounted files. Match UID/GID:

```dockerfile
ARG CONTAINER_USER_ID=1000
ARG CONTAINER_GROUP_ID=1000

RUN groupmod -g ${CONTAINER_GROUP_ID} node && \
    usermod -u ${CONTAINER_USER_ID} -g ${CONTAINER_GROUP_ID} node

USER node
```

Or in docker-compose:
```yaml
user: "${UID}:${GID}"
```

The official devcontainer uses the `node` user (non-root) for security.

### Path differences in containers

| Component | Local Path | Container Path |
|-----------|-----------|----------------|
| Authentication | `~/.claude.json` | `/home/node/.claude/` |
| Workspace | Current directory | `/workspace` |
| MCP Config (project) | `.mcp.json` | `/workspace/.mcp.json` |
| Command History | N/A | `/commandhistory/` (volume) |

Reference these container paths in your MCP configurations:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  }
}
```

### Official devcontainer structure

Anthropic provides a reference implementation at `github.com/anthropics/claude-code/.devcontainer/`:

```json
{
  "name": "Claude Code Sandbox",
  "build": {
    "dockerfile": "Dockerfile",
    "args": {
      "CLAUDE_CODE_VERSION": "latest"
    }
  },
  "customizations": {
    "vscode": {
      "extensions": ["anthropic.claude-code"],
      "settings": {
        "terminal.integrated.defaultProfile.linux": "zsh"
      }
    }
  },
  "mounts": [
    "source=${localWorkspaceFolder},target=/workspace,type=bind",
    "source=commandhistory,target=/commandhistory,type=volume"
  ],
  "runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"],
  "workspaceFolder": "/workspace"
}
```

Based on `mcr.microsoft.com/devcontainers/typescript-node:20` with ZSH, Git Delta, and security features built-in.

## Configuration examples

### Filesystem access in containers

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/workspace/src",
        "/workspace/docs"
      ],
      "env": {
        "ALLOWED_PATHS": "/workspace"
      }
    }
  }
}
```

For sandboxed access with explicit mount points:
```json
{
  "mcpServers": {
    "filesystem-sandbox": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--mount", "type=bind,src=/workspace,dst=/projects",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### GitHub integration with environment variables

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

Set the token externally (not in config):
```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

### Database servers for development

**PostgreSQL**:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://${DB_USER}:${DB_PASS}@postgres:5432/${DB_NAME}"
      ]
    }
  }
}
```

**SQLite** (useful in containers with persistent volumes):
```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "/workspace/data/app.db"
      ]
    }
  }
}
```

### Complete multi-server container configuration

Production-ready example combining multiple services:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "/workspace"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres-dev": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://${DB_USER}:${DB_PASS}@postgres:5432/myapp_dev"
      ]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_KEY}"
      }
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp"
    }
  }
}
```

Set environment variables via `.env` file (not committed):
```bash
GITHUB_TOKEN=ghp_your_token
DB_USER=devuser
DB_PASS=devpassword
BRAVE_KEY=your_brave_api_key
```

### Web search and API integrations

**Brave Search**:
```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_KEY}"
      }
    }
  }
}
```

**Perplexity API**:
```json
{
  "mcpServers": {
    "perplexity": {
      "command": "npx",
      "args": ["-y", "perplexity-mcp"],
      "env": {
        "PERPLEXITY_API_KEY": "${PERPLEXITY_KEY}",
        "PERPLEXITY_MODEL": "sonar"
      }
    }
  }
}
```

### Remote MCP servers (no container needed)

**Linear via SSE**:
```bash
claude mcp add --transport sse linear https://mcp.linear.app/sse --scope user
```

**Notion via HTTP**:
```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp --scope user
```

These remote servers eliminate container communication issues entirely since they run as external services.

## Environment variables and alternative methods

### Environment variable configuration patterns

**Direct environment variables** (set in shell or docker-compose):
```bash
export MAX_MCP_OUTPUT_TOKENS=50000
export MCP_TIMEOUT=10000
export ANTHROPIC_API_KEY=sk-ant-your-key
```

**In docker-compose.yml**:
```yaml
services:
  claude-dev:
    environment:
      - MAX_MCP_OUTPUT_TOKENS=50000
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    env_file:
      - .env
```

**In devcontainer.json**:
```json
{
  "containerEnv": {
    "MAX_MCP_OUTPUT_TOKENS": "50000",
    "ANTHROPIC_LOG": "debug"
  }
}
```

### Variable expansion in configuration files

Configuration files support sophisticated variable expansion:

```json
{
  "mcpServers": {
    "api-service": {
      "type": "sse",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Environment": "${DEPLOY_ENV:-development}"
      }
    }
  }
}
```

Syntax:
- `${VAR}` - Expands to environment variable VAR
- `${VAR:-default}` - Uses VAR if set, otherwise uses default value

### Alternative configuration methods

**Direct JSON editing** (most control):
```bash
# Edit project configuration
vi .mcp.json

# Edit user configuration
vi ~/.claude/claude.json
```

**CLI with JSON input**:
```bash
claude mcp add-json myserver '{
  "command": "docker",
  "args": ["run", "-i", "--rm", "myorg/mcp-server"],
  "env": {"API_KEY": "value"}
}'
```

**Import from Claude Desktop** (quick migration):
```bash
claude mcp import-from-claude-desktop
```

Copies your desktop MCP configurations to Claude Code with scope selection.

**VS Code settings integration** (when using devcontainer):
```json
{
  "customizations": {
    "vscode": {
      "mcp": {
        "servers": {
          "playwright": {
            "command": "npx",
            "args": ["-y", "@microsoft/mcp-server-playwright"]
          }
        }
      }
    }
  }
}
```

**Dev Container Features**:
```json
{
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  }
}
```

This automatically installs and configures Claude Code in your devcontainer.

### Configuration precedence order

When multiple configuration sources exist, Claude Code uses this precedence (highest to lowest):

1. **Local scope** - Project-specific user settings
2. **Project scope** - `.mcp.json` in project root (requires approval)
3. **User scope** - `~/.claude/claude.json` or equivalent
4. **Enterprise managed** - System-wide configuration at `/etc/claude-code/managed-settings.json` (Linux) or `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS)

## Conclusion

MCP server configuration in containerized Claude Code environments follows standard JSON patterns with critical container-specific considerations. Mount authentication directories to persist sessions, use environment variable expansion to keep secrets out of version control, and deploy MCP proxy when servers need cross-container communication. The official Anthropic devcontainer provides a secure, production-ready foundation with firewall rules and proper user isolation.

For straightforward use cases, place `.mcp.json` in your project root with stdio servers running in the same container. For complex architectures with multiple services, implement HTTP/SSE transport with MCP proxy bridges. Always test configurations with `claude mcp list` and monitor server status with the `/mcp` command within Claude Code to verify connectivity before deployment.