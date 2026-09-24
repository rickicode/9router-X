import urllib.request
import json
import time

URL = "http://192.168.90.101:3777/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

# Test payload sizes in approximate tokens (1 token ~= 4 chars)
# 10k tok ~= 40k chars
# 50k tok ~= 200k chars
# 100k tok ~= 400k chars
# 150k tok ~= 600k chars

MODELS_TO_PROBE = [
    {"name": "cloudflare-ai Llama-3.2-3B", "id": "cloudflare-ai/@cf/meta/llama-3.2-3b-instruct"},
    {"name": "cloudflare-ai Llama-3.1-8B", "id": "cloudflare-ai/@cf/meta/llama-3.1-8b-instruct-fp8"},
    {"name": "unikey Gemini-3.1-Flash-Lite", "id": "unikey/google/gemini-3.1-flash-lite"},
    {"name": "unikey DeepSeek-V4-Flash", "id": "uk/deepseek/deepseek-v4-flash"},
    {"name": "cline-free DeepSeek-V4.1-Flash", "id": "cline-free/deepseek/deepseek-v4.1-flash"},
    {"name": "cline-free GLM-5.3-Flash", "id": "cline-free/z-ai/glm-5.3-flash"},
    {"name": "tokenharbor DeepSeek-V4.1-Flash", "id": "th/deepseek-v4.1-flash:free"},
]

SIZES = [
    {"label": "10k tok", "chars": 40000},
    {"label": "50k tok", "chars": 200000},
    {"label": "100k tok", "chars": 400000},
    {"label": "150k tok", "chars": 600000},
]

PADDING = "data padding text " * 100 # repeated snippet

def generate_text(target_chars):
    base = "Please summarize: "
    repeats = (target_chars - len(base)) // len(PADDING) + 1
    return (base + (PADDING * repeats))[:target_chars]

def probe_model_size(model_id, text):
    payload = json.dumps({
        "model": model_id,
        "messages": [{"role": "user", "content": text}],
        "max_tokens": 10,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            return True, dur, None
    except Exception as e:
        dur = time.time() - t0
        msg = str(e)
        try:
            if hasattr(e, "read"):
                msg = e.read().decode("utf-8")
                msg = json.loads(msg).get("error", {}).get("message", msg)
        except:
            pass
        return False, dur, msg

def run():
    print("="*95)
    print("PROBE REAL UPSTREAM MAX CONTEXT ACCEPTANCE")
    print("="*95)
    for m in MODELS_TO_PROBE:
        mid = m["id"]
        mname = m["name"]
        print(f"\n--- Testing: {mname} ({mid}) ---")
        for sz in SIZES:
            s_label = sz["label"]
            s_chars = sz["chars"]
            txt = generate_text(s_chars)
            ok, dur, err = probe_model_size(mid, txt)
            status = f"PASS ({dur:.2f}s)" if ok else f"FAIL: {str(err)[:60]}"
            print(f"  [{s_label:<10}] ({s_chars} chars) -> {status}")
            if not ok and ("context" in str(err).lower() or "too large" in str(err).lower() or "400" in str(err) or "413" in str(err)):
                print(f"  --> Context ceiling hit at {s_label}!")
                break
            time.sleep(0.5)

if __name__ == "__main__":
    run()
