import anthropic

# Test without tools
client = anthropic.Anthropic(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

print("Testing simple request WITHOUT tools...")
try:
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=100,
        messages=[{"role": "user", "content": "Say hello in 5 words"}]
    )
    print("[OK] Response:", response.content[0].text)
    print("[OK] Model:", response.model)
    print("\n✓ Basic proxy works without tools!")
except Exception as e:
    print("[ERROR]", str(e))
    import traceback
    traceback.print_exc()
