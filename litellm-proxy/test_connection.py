import requests
import json

def test_proxy_health():
    try:
        response = requests.get(
            "http://localhost:4000/health",
            headers={"Authorization": "Bearer sk-1234"},
            timeout=5
        )
        print(f"[OK] Proxy health check: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Proxy not accessible: {e}")
        return False

def test_available_models():
    try:
        response = requests.get(
            "http://localhost:4000/v1/models",
            headers={"Authorization": "Bearer sk-1234"},
            timeout=10
        )
        if response.status_code == 200:
            models = response.json()
            print("[OK] Available models:")
            for model in models.get('data', []):
                print(f"   - {model['id']}")
            return models.get('data', [])
        else:
            print(f"[ERROR] Models endpoint failed: {response.status_code}")
            print(f"Response: {response.text}")
            return []
    except Exception as e:
        print(f"[ERROR] Cannot get models: {e}")
        return []

def test_simple_request():
    try:
        response = requests.post(
            "http://localhost:4000/v1/chat/completions",
            headers={
                "Authorization": "Bearer sk-1234",
                "Content-Type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-5",
                "messages": [{"role": "user", "content": "Hello"}],
                "max_tokens": 10
            },
            timeout=30
        )
        print(f"[OK] Simple request status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print(f"[OK] Response: {result['choices'][0]['message']['content']}")
            return True
        else:
            print(f"[ERROR] Request failed: {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Request error: {e}")
        return False

if __name__ == "__main__":
    print("LiteLLM Proxy Debugging")
    print("="*50)

    if test_proxy_health():
        print("\nChecking available models...")
        models = test_available_models()

        print("\nTesting simple request...")
        test_simple_request()
    else:
        print("\n[ERROR] Proxy is not running or accessible!")
        print("Try: docker-compose up -d")