import urllib.request
import json
import time

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

CODING_PROMPT = """Tuliskan implementasi class LRUCache di Python dengan kapasitas `capacity`.
Method: `get(key)` dan `put(key, value)` yang berjalan dalam kompleksitas waktu O(1).
Tuliskan langsung kodenya dengan komentar singkat."""

KILO_FREE_MODELS = [
    # Coding Specialists
    {"id": "kilocode/poolside/laguna-s-2.1:free", "family": "Poolside", "desc": "SE Specialist (Heavy)"},
    {"id": "kilocode/poolside/laguna-xs-2.1:free", "family": "Poolside", "desc": "SE Specialist (Fast)"},
    {"id": "kilocode/cohere/north-mini-code:free", "family": "Cohere", "desc": "North Mini Code"},
    {"id": "kilocode/thinkingmachines/inkling-small:free", "family": "ThinkMach", "desc": "Inkling Small (1M Ctx)"},
    {"id": "kilocode/qwen/qwen3.8-27b:free", "family": "Qwen", "desc": "Qwen 3.8 27B"},
    {"id": "kilocode/z-ai/glm-5.2:free", "family": "GLM", "desc": "GLM 5.2 Free"},
    # NVIDIA Nemotron
    {"id": "kilocode/nvidia/nemotron-3.5-lightning:free", "family": "NVIDIA", "desc": "Nemotron 3.5 Lightning"},
    {"id": "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free", "family": "NVIDIA", "desc": "Nemotron 3 Ultra 550B"},
    {"id": "kilocode/nvidia/nemotron-3-super-120b-a12b:free", "family": "NVIDIA", "desc": "Nemotron 3 Super 120B"},
    {"id": "kilocode/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "family": "NVIDIA", "desc": "Nemotron 3 Nano Omni"},
    {"id": "kilocode/nvidia/nemotron-3.5-content-safety:free", "family": "NVIDIA", "desc": "Nemotron Content Safety"},
    # Agentic & General
    {"id": "kilocode/nex-agi/nex-n2.5-pro:free", "family": "NexAGI", "desc": "Nex N2.5 Pro"},
    {"id": "kilocode/nex-agi/nex-n2.5-mini:free", "family": "NexAGI", "desc": "Nex N2.5 Mini"},
    {"id": "kilocode/stepfun/step-3.7-flash:free", "family": "StepFun", "desc": "Step 3.7 Flash"},
    {"id": "kilocode/dots-studio/dots-3-note-preview:free", "family": "Dots", "desc": "Dots 3 Note Preview"},
    {"id": "kilocode/liquid/lfm-2.5-2.6b:free", "family": "Liquid", "desc": "LFM 2.5 2.6B"},
    # Specialized Domains
    {"id": "kilocode/inclusionai/ling-3.0-flash-vl:free", "family": "Inclusion", "desc": "Ling 3.0 Flash VL"},
    {"id": "kilocode/inclusionai/ling-3.0-flash-fin:free", "family": "Inclusion", "desc": "Ling 3.0 Flash Fin"},
    {"id": "kilocode/inclusionai/ling-3.0-flash-sante:free", "family": "Inclusion", "desc": "Ling 3.0 Flash Sante"},
    # Auto Routers
    {"id": "kilocode/kilo-auto/free", "family": "Router", "desc": "Kilo Auto Free Router"},
    {"id": "kilocode/openrouter/free", "family": "Router", "desc": "OpenRouter Free Router"},
]

def test_model(mid):
    payload = json.dumps({
        "model": mid,
        "messages": [{"role": "user", "content": CODING_PROMPT}],
        "max_tokens": 350,
        "temperature": 0.1,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = data.get("usage", {})
            tokens = usage.get("completion_tokens", len(content.split()))
            # Quality check: contains get and put or class/OrderedDict/dict
            has_lru = any(k in content for k in ["LRUCache", "get", "put", "capacity"])
            return True, dur, tokens, content[:90].replace("\n", " "), has_lru, None
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
        return False, dur, 0, "", False, err_msg

def main():
    print("=" * 115)
    print("BENCHMARK CODING SEMUA MODEL FREE KILO CODE")
    print("Tugas: Implementasi Class LRUCache Python O(1)")
    print("=" * 115)
    print(f"{'Status':<8} | {'Latensi':<7} | {'Model ID':<52} | {'Family':<10} | {'Hasil / Error':<30}")
    print("-" * 115)

    results = []
    for item in KILO_FREE_MODELS:
        mid = item["id"]
        ok, dur, tokens, snippet, has_lru, err = test_model(mid)
        status_str = "OK 200" if ok else "ERROR"
        preview = snippet if ok else (err[:35] if err else "Failed")
        print(f"{status_str:<8} | {dur:5.2f}s | {mid:<52} | {item['family']:<10} | {preview}")
        results.append({
            "id": mid,
            "family": item["family"],
            "desc": item["desc"],
            "ok": ok,
            "duration": dur,
            "tokens": tokens,
            "has_lru": has_lru,
            "snippet": snippet,
            "error": err
        })
        time.sleep(0.4)

    print("=" * 115)
    print("PERINGKAT MODEL CODING KILO CODE (TERCEPAT -> TERLAMBAT):")
    print("=" * 115)
    success = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    success.sort(key=lambda x: x["duration"])
    for idx, r in enumerate(success, 1):
        quality = "Valid LRU" if r["has_lru"] else "Format Unclear"
        print(f"#{idx:<2} | {r['duration']:5.2f}s | {r['id']:<52} | {r['family']:<10} | {quality:<12} | {r['tokens']} tok")

    if failed:
        print("\nMODEL GAGAL / LIMIT / TIMEOUT:")
        for r in failed:
            print(f"- {r['id']:<52} | ({r['duration']:.2f}s) {r['error']}")

if __name__ == "__main__":
    main()
