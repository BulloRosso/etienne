import anthropic
import json

# Use Anthropic SDK but point to LiteLLM proxy
client = anthropic.Anthropic(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

# Anthropic format tools
tools = [
    {
        "name": "get_weather",
        "description": "Get weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City name"
                },
                "units": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature units"
                }
            },
            "required": ["location"]
        }
    },
    {
        "name": "create_file",
        "description": "Create a file with content",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the file"
                },
                "content": {
                    "type": "string",
                    "description": "File content"
                }
            },
            "required": ["filename", "content"]
        }
    }
]

def test_anthropic_format_to_openai_backend(model_name, backend_provider):
    """
    Test sending Anthropic API format request to proxy
    Proxy should route to OpenAI backend and return Anthropic format response
    """
    print(f"\n{'='*70}")
    print(f"Model: {model_name}")
    print(f"Backend: {backend_provider}")
    print(f"Request Format: Anthropic /messages API")
    print(f"Response Format: Anthropic API")
    print(f"{'='*70}")

    try:
        # Send Anthropic format request
        response = client.messages.create(
            model=model_name,
            max_tokens=1024,
            tools=tools,
            messages=[
                {
                    "role": "user",
                    "content": "What's the weather in London? Use celsius."
                }
            ]
        )

        print(f"[OK] Response received in Anthropic format")
        print(f"Response ID: {response.id}")
        print(f"Model: {response.model}")
        print(f"Stop Reason: {response.stop_reason}")

        # Check content blocks
        for i, block in enumerate(response.content):
            if block.type == "text":
                print(f"[OK] Text block {i}: {block.text[:100]}")
            elif block.type == "tool_use":
                print(f"[OK] Tool use block {i}:")
                print(f"     Tool: {block.name}")
                print(f"     Tool ID: {block.id}")
                print(f"     Input: {json.dumps(block.input, indent=8)}")

        # Check usage
        print(f"Tokens - Input: {response.usage.input_tokens}, Output: {response.usage.output_tokens}")

        # Verify tool calls were made
        has_tools = any(block.type == "tool_use" for block in response.content)
        if has_tools:
            print(f"[OK] Tool calling works with {backend_provider} backend!")
            return True
        else:
            print(f"[WARN] No tool calls made")
            return False

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("="*70)
    print("ANTHROPIC API FORMAT -> OPENAI BACKEND TEST")
    print("="*70)
    print("This tests if LiteLLM proxy can:")
    print("1. Accept Anthropic /messages API format requests")
    print("2. Route to OpenAI backend")
    print("3. Translate tool calls between formats")
    print("4. Return response in Anthropic API format")
    print("="*70)

    # Test scenarios
    tests = [
        ("claude-via-openai", "OpenAI GPT-4o (exposed as claude-via-openai)"),
        ("gpt-4o", "OpenAI GPT-4o"),
        ("claude-sonnet-4-5", "Anthropic Claude (baseline test)"),
    ]

    results = {}
    for model, backend in tests:
        success = test_anthropic_format_to_openai_backend(model, backend)
        results[model] = success

    # Summary
    print(f"\n{'='*70}")
    print("TEST SUMMARY")
    print(f"{'='*70}")
    for model, success in results.items():
        status = "[OK] PASS" if success else "[ERROR] FAIL"
        print(f"{model:30} {status}")

    print(f"\n{'='*70}")
    print("CONCLUSION:")
    if results.get("gpt-4o") or results.get("claude-via-openai"):
        print("[OK] LiteLLM can translate Anthropic format -> OpenAI backend!")
        print("     Claude Code can call the proxy using Anthropic SDK")
        print("     and the proxy will route to OpenAI models seamlessly.")
    else:
        print("[ERROR] Cross-provider translation failed")
        print("        LiteLLM may not support this use case")
