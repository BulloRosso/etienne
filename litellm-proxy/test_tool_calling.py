import openai
import json
from dotenv import load_dotenv
import time

load_dotenv()

client = openai.OpenAI(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

# Tools for testing
tools = [
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Create a file with code",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string"},
                    "content": {"type": "string"},
                    "language": {"type": "string"}
                },
                "required": ["filename", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_bash",
            "description": "Execute bash command",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"}
                },
                "required": ["command"]
            }
        }
    }
]

def test_claude_4_model(model_name, task_type="simple"):
    """Test Claude 4 models with different task complexity"""
    
    tasks = {
        "simple": "Create a Python function to check if a number is prime. Save it as prime_check.py",
        "complex": "Create a complete Flask web application with user authentication, database integration, and API endpoints. Structure it with proper separation of concerns across multiple files."
    }
    
    prompt = tasks[task_type]
    
    print(f"\n{'='*70}")
    print(f"Testing: {model_name} ({task_type} task)")
    print(f"{'='*70}")
    
    try:
        start_time = time.time()
        
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": "You are Claude Code 2.0. You excel at coding tasks and can create files and execute commands."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            tools=tools,
            tool_choice="auto",
            max_tokens=3000 if task_type == "simple" else 6000
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        print(f"✅ Response time: {response_time:.2f}s")
        
        if response.choices[0].message.content:
            content_preview = response.choices[0].message.content[:200]
            print(f"📝 Content: {content_preview}...")
        
        if response.choices[0].message.tool_calls:
            print(f"🔧 Tool calls: {len(response.choices[0].message.tool_calls)}")
            for i, tool_call in enumerate(response.choices[0].message.tool_calls, 1):
                args = json.loads(tool_call.function.arguments)
                print(f"   {i}. {tool_call.function.name}")
                if 'filename' in args:
                    print(f"      → File: {args['filename']}")
                if 'command' in args:
                    print(f"      → Command: {args['command']}")
        
        # Token usage
        if hasattr(response, 'usage'):
            print(f"📊 Tokens: {response.usage.total_tokens}")
            
        return True, response_time
        
    except Exception as e:
        print(f"❌ Error: {str(e)[:100]}...")
        return False, 0

def compare_claude_4_models():
    """Compare Claude 4.5 Sonnet vs Haiku"""
    print("🚀 Claude 4 Models Test via LiteLLM Proxy")
    print("Testing the latest Claude 4.5 Sonnet and Haiku models")
    
    test_cases = [
        ("claude-sonnet-4-5", "simple"),
        ("claude-sonnet-4-5", "complex"),
        ("claude-haiku-4-5", "simple"),
        ("claude-haiku-4-5", "complex")
    ]
    
    results = {}
    
    for model, complexity in test_cases:
        success, response_time = test_claude_4_model(model, complexity)
        results[f"{model}_{complexity}"] = {
            "success": success,
            "time": response_time
        }
        time.sleep(2)  # Brief pause between tests
    
    # Summary
    print(f"\n{'='*70}")
    print("📋 CLAUDE 4 TEST RESULTS")
    print(f"{'='*70}")
    
    for test_name, result in results.items():
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        time_str = f"({result['time']:.2f}s)" if result["success"] else ""
        print(f"{test_name:25} {status} {time_str}")
    
    # Recommendations
    print(f"\n🎯 CLAUDE 4 USAGE RECOMMENDATIONS:")
    if results.get("claude-sonnet-4-5_complex", {}).get("success"):
        print("• Use 'claude-sonnet-4-5' for:")
        print("  - Complex coding projects (Claude Code 2.0 style)")
        print("  - Multi-file applications")
        print("  - Advanced reasoning tasks")
        print("  - Agent workflows")
    
    if results.get("claude-haiku-4-5_simple", {}).get("success"):
        print("• Use 'claude-haiku-4-5' for:")
        print("  - Quick code snippets")
        print("  - Simple functions")
        print("  - High-volume tasks")
        print("  - Cost optimization")
    
    return results

if __name__ == "__main__":
    try:
        results = compare_claude_4_models()
        print("\n🎉 Claude 4 testing completed!")
        print("You now have access to the latest Claude models via OpenAI SDK!")
    except Exception as e:
        print(f"\n💥 Error: {e}")
