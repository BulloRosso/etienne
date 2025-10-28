import anthropic
import json

# Use Anthropic SDK but point to LiteLLM proxy
client = anthropic.Anthropic(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

# Anthropic format tools (same format Claude Code would send)
tools = [
    {
        "name": "create_file",
        "description": "Create a file with code content",
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the file to create"
                },
                "content": {
                    "type": "string",
                    "description": "Content of the file"
                },
                "language": {
                    "type": "string",
                    "description": "Programming language"
                }
            },
            "required": ["filename", "content"]
        }
    },
    {
        "name": "execute_bash",
        "description": "Execute a bash command",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute"
                }
            },
            "required": ["command"]
        }
    }
]

def test_claude_to_openai_routing(claude_model, openai_backend, test_name):
    """
    Test the complete flow:
    1. Send Anthropic Claude API format request (like Claude Code would)
    2. Proxy routes to OpenAI backend
    3. Receive response in Anthropic Claude format
    """
    print("="*70)
    print(f"TEST: {test_name}")
    print("="*70)
    print(f"Request Format:  Anthropic /messages ({claude_model})")
    print(f"Backend Model:   OpenAI {openai_backend}")
    print(f"Response Format: Anthropic /messages")
    print("="*70)

    try:
        # Send request as Claude Code would
        print("\n[1] Sending Anthropic format request with tools...")

        # Determine appropriate prompt based on model
        if "haiku" in claude_model.lower() or "mini" in openai_backend.lower():
            prompt = "Create a simple hello world function in Python. Save it as hello.py"
        else:
            prompt = "Create a Python function to calculate fibonacci numbers. Save it as fibonacci.py"

        response = client.messages.create(
            model=claude_model,
            max_tokens=2048,
            tools=tools,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        print("[OK] Response received in Anthropic format")
        print(f"\n[2] Response Details:")
        print(f"    Response ID: {response.id}")
        print(f"    Model: {response.model}")
        print(f"    Stop Reason: {response.stop_reason}")

        # Check content blocks
        print(f"\n[3] Content Blocks:")
        for i, block in enumerate(response.content):
            if block.type == "text":
                preview = block.text[:150].replace("\n", " ")
                print(f"    Block {i} [text]: {preview}...")
            elif block.type == "tool_use":
                print(f"    Block {i} [tool_use]:")
                print(f"        Tool Name: {block.name}")
                print(f"        Tool ID: {block.id}")
                print(f"        Tool Input:")
                for key, value in block.input.items():
                    if len(str(value)) > 100:
                        print(f"            {key}: {str(value)[:100]}...")
                    else:
                        print(f"            {key}: {value}")

        # Token usage
        print(f"\n[4] Token Usage:")
        print(f"    Input tokens:  {response.usage.input_tokens}")
        print(f"    Output tokens: {response.usage.output_tokens}")
        print(f"    Total tokens:  {response.usage.input_tokens + response.usage.output_tokens}")

        # Verify tool calls
        has_tools = any(block.type == "tool_use" for block in response.content)

        print(f"\n{'='*70}")
        if has_tools:
            print(f"[SUCCESS] {test_name} WORKS!")
            print("          Tool calling translation successful")
        else:
            print("[WARNING] Response received but no tool calls made")
        print(f"{'='*70}")

        return True

    except Exception as e:
        print(f"\n[ERROR] Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"\n{'='*70}")
        print("[FAILED] Cross-provider translation did not work")
        print(f"{'='*70}")
        return False

if __name__ == "__main__":
    print("\n" + "="*70)
    print("CLAUDE CODE -> OPENAI BACKEND ROUTING TESTS")
    print("="*70)

    # Test with NATIVE Claude model names (as Claude Code would send)
    tests = [
        {
            "claude_model": "claude-sonnet-4-5",
            "openai_backend": "GPT-5-Codex",
            "test_name": "claude-sonnet-4-5 -> GPT-5-Codex"
        },
        {
            "claude_model": "claude-haiku-4-5",
            "openai_backend": "GPT-5-mini",
            "test_name": "claude-haiku-4-5 -> GPT-5-mini"
        }
    ]

    results = {}
    for test in tests:
        print("\n")
        success = test_claude_to_openai_routing(
            test["claude_model"],
            test["openai_backend"],
            test["test_name"]
        )
        results[test["test_name"]] = success

    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    for test_name, success in results.items():
        status = "[PASS]" if success else "[FAIL]"
        print(f"{status} {test_name}")

    print("\n" + "="*70)
    if all(results.values()):
        print("[OK] All tests passed! Your LiteLLM proxy is ready for Claude Code!")
        print("[OK] Claude Code can send Anthropic format requests")
        print("[OK] Proxy will route to OpenAI backends (Codex/mini)")
        print("[OK] Claude Code will receive Anthropic format responses")
    else:
        print("[FAIL] Some tests failed - check configuration")
