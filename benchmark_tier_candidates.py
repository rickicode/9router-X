import urllib.request
import json
import time

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

BENCHMARK_PROMPTS = {
    "EASY": "Tuliskan fungsi JavaScript singkat untuk mengecek apakah sebuah string adalah palindrom.",
    "MEDIUM": "Buat fungsi TypeScript dengan generic dan middleware Express untuk validasi JWT Bearer token dengan error handling.",
    "HARD": "Jelaskan root cause dan berikan solusi pencegahan deadlock pada distributed lock manager Redis saat worker crash di tengah two-phase lock acquisition."
}

CANDIDATES = [
    # --- EASY CANDIDATES ---
    {"name": "free-model (Combo)", "id": "free-model", "tier": "EASY"},
    {"name": "oc/muse-spark-1.3-contributor-free", "id": "oc/muse-spark-1.3-contributor-free", "tier": "EASY"},
    {"name": "mimo (Combo)", "id": "mimo", "tier": "EASY"},
    {"name": "cloudflare-ai Llama-3.2-3B", "id": "cloudflare-ai/@cf/meta/llama-3.2-3b-instruct", "tier": "EASY"},
    {"name": "unikey Gemini-3.1-Flash-Lite", "id": "unikey/google/gemini-3.1-flash-lite", "tier": "EASY"},

    # --- MEDIUM CANDIDATES ---
    {"name": "cline-free GLM-5.3-Flash", "id": "cline-free/z-ai/glm-5.3-flash", "tier": "MEDIUM"},
    {"name": "cline-free DeepSeek-V4.1-Flash", "id": "cline-free/deepseek/deepseek-v4.1-flash", "tier": "MEDIUM"},
    {"name": "cloudflare-ai Llama-3.1-8B", "id": "cloudflare-ai/@cf/meta/llama-3.1-8b-instruct-fp8", "tier": "MEDIUM"},
    {"name": "unikey Claude-Haiku-4.5", "id": "uk/claude-haiku-4-5-20251001", "tier": "MEDIUM"},

    # --- HARD CANDIDATES ---
    {"name": "gemini-flash-latest (Combo)", "id": "gemini-flash-latest", "tier": "HARD"},
    {"name": "gpt-latest (Combo)", "id": "gpt-latest", "tier": "HARD"},
    {"name": "ag/gemini-3.8-flash-high", "id": "ag/gemini-3.8-flash-high", "tier": "HARD"},
    {"name": "claude-latest (Combo)", "id": "claude-latest", "tier": "HARD"},
]

def test_model(cand, task_tier, prompt):
    payload = json.dumps({
        "model": cand["id"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 400,
        "temperature": 0.2,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return True, dur, len(content), content[:100].replace("\n", " "), None
    except Exception as e:
        dur = time.time() - t0
        return False, dur, 0, "", str(e)

def run():
    print("="*100)
    print("BENCHMARK KANDIDAT MODEL & COMBO (EASY, MEDIUM, HARD)")
    print("="*100)
    print(f"{'Target Tier':<8} | {'Kandidat Model / Combo':<35} | {'Status':<7} | {'Latency':<8} | {'Output':<10} | {'Cuplikan Jawaban'}")
    print("-"*100)

    for cand in CANDIDATES:
        task_tier = cand["tier"]
        prompt = BENCHMARK_PROMPTS[task_tier]
        ok, dur, out_len, snippet, err = test_model(cand, task_tier, prompt)
        status_str = "OK 200" if ok else "ERROR"
        snippet_preview = snippet if ok else (err[:35] if err else "")
        out_str = f"{out_len} chars" if ok else "-"
        print(f"{task_tier:<8} | {cand['name']:<35} | {status_str:<7} | {dur:.2f}s   | {out_str:<10} | {snippet_preview}")
        time.sleep(0.5)

if __name__ == "__main__":
    run()
