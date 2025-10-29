import anthropic

# Use Anthropic SDK but point to LiteLLM proxy
client = anthropic.Anthropic(
    api_key="sk-1234",
    base_url="http://localhost:4000"
)

print("="*70)
print("NEW MODEL MAPPING TEST")
print("="*70)
print("SMALL_MODEL:  claude-haiku-4-5  -> gpt-4o-mini")
print("MIDDLE_MODEL: claude-sonnet-4-5 -> gpt-4o")
print("BIG_MODEL:    claude-opus-4-5   -> o1")
print("="*70)

tests = [
    ("claude-haiku-4-5", "gpt-4o-mini", "SMALL"),
    ("claude-sonnet-4-5", "gpt-4o", "MIDDLE"),
    ("claude-opus-4-5", "o1", "BIG"),
]

for model_name, expected_backend, tier in tests:
    print(f"\n[{tier}_MODEL] Testing {model_name}...")
    try:
        response = client.messages.create(
            model=model_name,
            max_tokens=50,
            messages=[{"role": "user", "content": "Say hello in 3 words"}]
        )
        print(f"[OK] Response: {response.content[0].text}")
        print(f"[OK] Backend model: {response.model}")

        # Check if correct backend
        if expected_backend.replace("-", "") in response.model.replace("-", ""):
            print(f"[OK] Correctly routed to {expected_backend}")
        else:
            print(f"[WARN] Expected {expected_backend} but got {response.model}")
    except Exception as e:
        print(f"[ERROR] {str(e)}")

print("\n" + "="*70)
print("Test complete!")
