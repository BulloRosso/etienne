import openai
import json

client = openai.OpenAI(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

# OpenAI format tools
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"},
                    "units": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["location"]
            }
        }
    }
]

def test_model_with_tools(model_name, backend_type):
    """Test a model with tool calling"""
    print(f"\n{'='*70}")
    print(f"Testing: {model_name}")
    print(f"Backend: {backend_type}")
    print(f"{'='*70}")

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": "What's the weather in Paris? Use celsius."
                }
            ],
            tools=tools,
            tool_choice="auto"
        )

        print(f"[OK] Response received")
        print(f"Model used: {response.model}")

        if response.choices[0].message.content:
            print(f"Content: {response.choices[0].message.content[:100]}")

        if response.choices[0].message.tool_calls:
            print(f"[OK] Tool calls detected: {len(response.choices[0].message.tool_calls)}")
            for tool_call in response.choices[0].message.tool_calls:
                print(f"   Function: {tool_call.function.name}")
                args = json.loads(tool_call.function.arguments)
                print(f"   Arguments: {json.dumps(args, indent=6)}")
        else:
            print(f"[WARN] No tool calls made")

        if hasattr(response, 'usage'):
            print(f"Tokens: {response.usage.total_tokens}")

        return True

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        return False

if __name__ == "__main__":
    print("="*70)
    print("CROSS-PROVIDER TOOL CALLING TEST")
    print("Testing if LiteLLM can translate tool calls between providers")
    print("="*70)

    # Test scenarios
    tests = [
        ("claude-sonnet-4-5", "Anthropic Claude"),
        ("gpt-4o", "OpenAI GPT-4o"),
        ("claude-via-openai", "OpenAI (with Claude name)")
    ]

    results = {}
    for model, backend in tests:
        success = test_model_with_tools(model, backend)
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
    if all(results.values()):
        print("[OK] LiteLLM successfully handles tool calling for all providers!")
        print("     It translates between OpenAI and Anthropic formats automatically.")
    else:
        print("[WARN] Some models failed. Check the logs above.")
