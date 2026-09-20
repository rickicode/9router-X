import urllib.request
import json
import time

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT = "Tuliskan fungsi Python binary_search(arr, target) dengan penanganan edge cases dan docstring singkat."

FRONTIER_MODELS = [
    # DeepSeek Flagships & Aliases
    {"id": "cline-free/deepseek/deepseek-v4.1-flash", "family": "DeepSeek", "tier": "Frontier Flagship"},
    {"id": "cline-free/deepseek/deepseek-v4-flash-0731", "family": "DeepSeek", "tier": "Frontier Fast"},
    {"id": "cline-free/deepseek/deepseek-v4-flash-0731:free", "family": "DeepSeek", "tier": "Frontier Free"},
    {"id": "cline-free/~deepseek/deepseek-flash-latest", "family": "DeepSeek", "tier": "Upstream Alias"},
    {"id": "cline-free/~deepseek/deepseek-v4-flash-latest", "family": "DeepSeek", "tier": "Upstream Alias"},
    {"id": "cline-free/deepseek/deepseek-v4-flash", "family": "DeepSeek", "tier": "Frontier Base"},
    # GLM Flagships
    {"id": "cline-free/z-ai/glm-5.3-flash", "family": "GLM", "tier": "Frontier Flagship"},
    {"id": "cline-free/z-ai/glm-5.2:free", "family": "GLM", "tier": "Frontier Free"},
    {"id": "cline-free/z-ai/glm-4.7-flash", "family": "GLM", "tier": "Fast Agentic"},
    {"id": "cline-free/z-ai/glm-4.5", "family": "GLM", "tier": "Base"},
    # Moonshot Kimi
    {"id": "cline-free/moonshotai/kimi-k3", "family": "Kimi", "tier": "Frontier Reasoning"},
    # Poolside
    {"id": "cline-free/poolside/laguna-xs-2.1:free", "family": "Poolside", "tier": "Frontier Fast SE"},
    {"id": "cline-free/poolside/laguna-s-2.1:free", "family": "Poolside", "tier": "Frontier Heavy SE"},
    # Google Gemma
    {"id": "cline-free/google/gemma-4-31b-it:free", "family": "Google", "tier": "Frontier 31B"},
    {"id": "cline-free/google/gemma-4-26b-a4b-it:free", "family": "Google", "tier": "Frontier 26B"},
    # NVIDIA Nemotron
    {"id": "cline-free/nvidia/nemotron-3-ultra-550b-a55b:free", "family": "NVIDIA", "tier": "Frontier 550B"},
    {"id": "cline-free/nvidia/nemotron-3-super-120b-a12b:free", "family": "NVIDIA", "tier": "Frontier 120B"},
    {"id": "cline-free/nvidia/nemotron-3.5-lightning:free", "family": "NVIDIA", "tier": "Fast Frontier"},
    {"id": "cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "family": "NVIDIA", "tier": "Reasoning"},
    # MiniMax & Cohere & ThinkingMachines
    {"id": "cline-free/minimax/minimax-m3", "family": "MiniMax", "tier": "Frontier M3"},
    {"id": "cline-free/cohere/north-mini-code:free", "family": "Cohere", "tier": "Code Frontier"},
    {"id": "cline-free/thinkingmachines/inkling:free", "family": "ThinkMach", "tier": "Agentic Frontier"},
    {"id": "cline-free/thinkingmachines/inkling-small:free", "family": "ThinkMach", "tier": "Fast Code"},
    # Meta / Contributor & Nex
    {"id": "cline-free/meta/muse-spark-1.3-contributor", "family": "Meta", "tier": "Spark 1.3"},
    {"id": "cline-free/nex-agi/nex-n2.5-pro:free", "family": "NexAGI", "tier": "Pro 2.5"},
    # OpenRouter
    {"id": "cline-free/openrouter/auto-beta", "family": "OpenRouter", "tier": "Aggregator"},
    {"id": "cline-free/openrouter/free", "family": "OpenRouter", "tier": "Aggregator Free"},
]

def test_model(mid):
    payload = json.dumps({
        "model": mid,
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 200,
        "temperature": 0.1,
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
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = data.get("usage", {})
            return True, dur, usage.get("completion_tokens", len(content.split())), content[:80].replace("\n", " "), None
    except Exception as e:
        dur = time.time() - t0
        err_msg = str(e)
        try:
            if hasattr(e, "read"):
                err_body = e.read().decode("utf-8")
                err_obj = json.loads(err_body)
                err_msg = err_obj.get("error", {}).get("message", err_msg)
        except:
            pass
        return False, dur, 0, "", err_msg

def main():
    print("=" * 110)
    print("BENCHMARK SEMUA MODEL FRONTIER CLINE-FREE")
    print(f"Endpoint: {URL} | Total Models: {len(FRONTIER_MODELS)}")
    print("=" * 110)
    print(f"{'Status':<8} | {'Latensi':<7} | {'Model ID':<50} | {'Family':<10} | {'Hasil / Error':<28}")
    print("-" * 110)

    results = []
    for item in FRONTIER_MODELS:
        mid = item["id"]
        ok, dur, tokens, snippet, err = test_model(mid)
        status_str = "OK 200" if ok else "ERROR"
        preview = snippet if ok else (err[:35] if err else "Failed")
        print(f"{status_str:<8} | {dur:5.2f}s | {mid:<50} | {item['family']:<10} | {preview}")
        results.append({
            "id": mid,
            "family": item["family"],
            "tier": item["tier"],
            "ok": ok,
            "duration": dur,
            "tokens": tokens,
            "snippet": snippet,
            "error": err
        })
        time.sleep(0.3)

    print("=" * 110)
    print("RINGKASAN HASIL BENCHMARK (TERCEPAT -> TERLAMBAT):")
    print("=" * 110)
    success = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    success.sort(key=lambda x: x["duration"])
    for idx, r in enumerate(success, 1):
        print(f"#{idx:<2} | {r['duration']:5.2f}s | {r['id']:<50} | {r['family']:<10} | {r['tokens']} tok")

    if failed:
        print("\nMODEL GAGAL / LIMIT / UNAVAILABLE:")
        for r in failed:
            print(f"- {r['id']:<50} | Error ({r['duration']:.2f}s): {r['error']}")

if __name__ == "__main__":
    main()
