# LiteLLM Proxy for Claude Code

This LiteLLM proxy enables Claude Code to use OpenAI models (GPT-5-Codex and GPT-5-mini) while maintaining the Anthropic API format.

## Architecture

```
Claude Code (Anthropic API format)
    ↓
LiteLLM Proxy (port 4000)
    ↓
OpenAI Backend (GPT-5-Codex / GPT-5-mini)
    ↓
LiteLLM Proxy (translates back to Anthropic format)
    ↓
Claude Code receives response
```

## Key Features

- **Format Translation**: Accepts Anthropic `/messages` API format, routes to OpenAI, returns Anthropic format
- **No Anthropic Passthrough**: All Claude model names route to OpenAI backends only
- **Tool Calling Support**: Full support for tool/function calling across providers
- **Native Model Names**: Claude Code uses native model names (`claude-sonnet-4-5`, `claude-haiku-4-5`)

## Model Routing

| Claude Model Name | OpenAI Backend | Use Case |
|-------------------|----------------|----------|
| `claude-sonnet-4-5` | `gpt-5-codex` | Complex coding tasks, multi-file projects |
| `claude-haiku-4-5` | `gpt-5-mini` | Quick tasks, simple functions |
| `claude-smart` (alias) | `gpt-5-codex` | Alias for sonnet |
| `claude-fast` (alias) | `gpt-5-mini` | Alias for haiku |
| `claude-code` (alias) | `gpt-5-codex` | Alias for sonnet |

## Setup

### 1. Environment Variables

Create or update `.env` file:

```bash
ANTHROPIC_API_KEY=your_anthropic_key  # Not used but kept for reference
OPENAI_API_KEY=your_openai_key
LITELLM_MASTER_KEY=sk-1234
LITELLM_SALT_KEY=sk-5678
```

### 2. Configuration

The `config.yaml` file defines the model routing:

```yaml
model_list:
  # Native Claude model names route to OpenAI backends ONLY
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: openai/gpt-5-codex
      api_key: os.environ/OPENAI_API_KEY
      max_tokens: 8192

  - model_name: claude-haiku-4-5
    litellm_params:
      model: openai/gpt-5-mini
      api_key: os.environ/OPENAI_API_KEY
      max_tokens: 4096

general_settings:
  master_key: "sk-1234"
  store_model_in_db: False  # No database required
```

### 3. Start the Proxy

```bash
docker-compose up -d
```

The proxy will be available at `http://localhost:4000`

### 4. Verify Status

```bash
# Check container status
docker ps | grep litellm

# Check logs
docker logs litellm-proxy-litellm-1

# List available models
curl -s http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-1234" | python -m json.tool
```

## Testing

### Basic Connection Test

```bash
python test_connection.py
```

Tests:
- Health check
- Available models
- Simple chat completion

### Cross-Provider Routing Test

```bash
python test_claude_to_codex.py
```

Tests:
- `claude-sonnet-4-5` → GPT-5-Codex with tool calling
- `claude-haiku-4-5` → GPT-5-mini with tool calling

Expected output:
```
[PASS] claude-sonnet-4-5 -> GPT-5-Codex
[PASS] claude-haiku-4-5 -> GPT-5-mini
[OK] All tests passed! Your LiteLLM proxy is ready for Claude Code!
```

## Usage with Claude Code

Claude Code will automatically use the proxy by configuring the base URL:

```python
# Claude Code configuration
client = anthropic.Anthropic(
    api_key="sk-1234",  # LiteLLM master key
    base_url="http://localhost:4000"  # LiteLLM proxy
)

# Claude Code sends Anthropic format request
response = client.messages.create(
    model="claude-sonnet-4-5",  # Routes to gpt-5-codex
    max_tokens=2048,
    tools=tools,
    messages=[{"role": "user", "content": "Create a Python function"}]
)

# Response is in Anthropic format with tool_use blocks
```

## Technical Details

### Request Flow

1. **Input**: Claude Code sends Anthropic API format:
   - Endpoint: `/v1/messages`
   - Tools: Anthropic `input_schema` format
   - Model: `claude-sonnet-4-5` or `claude-haiku-4-5`

2. **Translation**: LiteLLM proxy:
   - Translates Anthropic tools → OpenAI function format
   - Routes to OpenAI backend (gpt-5-codex or gpt-5-mini)
   - Receives OpenAI response

3. **Output**: LiteLLM proxy returns Anthropic format:
   - Content blocks with `tool_use` type
   - `stop_reason: "tool_use"`
   - Anthropic tool structure (`name`, `id`, `input`)

### Why No Database?

This proxy configuration runs without a database (`store_model_in_db: False`) for:
- Simpler deployment
- Lower resource usage
- Faster startup time
- No state management needed

## Troubleshooting

### Proxy not starting

```bash
# Check logs
docker logs litellm-proxy-litellm-1

# Common issues:
# - Missing environment variables
# - Port 4000 already in use
# - Invalid OpenAI API key
```

### 401 Authentication Error

Ensure you're using the master key from `config.yaml`:

```bash
curl http://localhost:4000/v1/models \
  -H "Authorization: Bearer sk-1234"
```

### Tool calling not working

Verify the model supports tool calling:

```bash
python test_claude_to_codex.py
```

Both GPT-5-Codex and GPT-5-mini support function calling.

## Files

- `config.yaml` - Model routing configuration
- `docker-compose.yml` - Container setup
- `.env` - API keys and secrets
- `test_connection.py` - Basic connectivity test
- `test_claude_to_codex.py` - Cross-provider routing test
- `README.md` - This file

## Notes

- **No Anthropic API calls**: All requests route to OpenAI, Anthropic API key is not used
- **Format transparency**: Claude Code doesn't know it's using OpenAI models
- **Cost optimization**: Use `claude-haiku-4-5` (→ gpt-5-mini) for cost-sensitive tasks
- **Performance**: Use `claude-sonnet-4-5` (→ gpt-5-codex) for complex coding tasks
