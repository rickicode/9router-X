import urllib.request
import json
import time

URL = "http://192.168.90.101:3777/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT = """Tuliskan fungsi Python binary_search(arr, target) yang mengembalikan index target jika ditemukan atau -1 jika tidak. Sertakan penanganan jika array kosong."""

# Complete 21 free models on Kilo Code with verified metadata
MODELS = [
    {"id": "kilocode/kilo-auto/free", "name": "Kilo Auto Free (Router)", "context": 256000, "max_out": 10000},
    {"id": "kilocode/poolside/laguna-xs-2.1:free", "name": "Poolside Laguna XS 2.1", "context": 262144, "max_out": 32768},
    {"id": "kilocode/poolside/laguna-s-2.1:free", "name": "Poolside Laguna S 2.1", "context": 262144, "max_out": 32768},
    {"id": "kilocode/cohere/north-mini-code:free", "name": "Cohere North Mini Code", "context": 256000, "max_out": 64000},
    {"id": "kilocode/nex-agi/nex-n2.5-mini:free", "name": "Nex AGI N2.5 Mini", "context": 262144, "max_out": 235929},
    {"id": "kilocode/nex-agi/nex-n2.5-pro:free", "name": "Nex AGI N2.5 Pro", "context": 262144, "max_out": 235929},
    {"id": "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free", "name": "NVIDIA Nemotron 3 Ultra 550B", "context": 1000000, "max_out": 65536},
    {"id": "kilocode/nvidia/nemotron-3.5-lightning:free", "name": "NVIDIA Nemotron 3.5 Lightning", "context": 1000000, "max_out": 65536},
    {"id": "kilocode/nvidia/nemotron-3-super-120b-a12b:free", "name": "NVIDIA Nemotron 3 Super 120B", "context": 262144, "max_out": 235929},
    {"id": "kilocode/inclusionai/ling-3.0-flash-vl:free", "name": "inclusionAI Ling 3.0 Flash VL", "context": 262144, "max_out": 32768},
    {"id": "kilocode/inclusionai/ling-3.0-flash-fin:free", "name": "inclusionAI Ling 3.0 Flash Fin", "context": 262144, "max_out": 32768},
    {"id": "kilocode/inclusionai/ling-3.0-flash-sante:free", "name": "inclusionAI Ling 3.0 Flash Sante", "context": 262144, "max_out": 32768},
    {"id": "kilocode/dots-studio/dots-3-note-preview:free", "name": "Dots Studio Dots 3 Note", "context": 512000, "max_out": 460800},
    {"id": "kilocode/stepfun/step-3.7-flash:free", "name": "StepFun Step 3.7 Flash", "context": 262144, "max_out": 262144},
    {"id": "kilocode/z-ai/glm-5.2:free", "name": "Z.ai GLM 5.2 Free", "context": 32768, "max_out": 29491},
    {"id": "kilocode/thinkingmachines/inkling-small:free", "name": "Thinking Machines Inkling Small", "context": 1048576, "max_out": 262144},
    {"id": "kilocode/qwen/qwen3.8-27b:free", "name": "Qwen Qwen3.8 27B", "context": 262144, "max_out": 235929},
    {"id": "kilocode/liquid/lfm-2.5-2.6b:free", "name": "LiquidAI LFM 2.5 2.6B", "context": 65536, "max_out": 8192},
    {"id": "kilocode/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "name": "NVIDIA Nemotron 3 Nano Omni", "context": 256000, "max_out": 65536},
    {"id": "kilocode/nvidia/nemotron-3.5-content-safety:free", "name": "NVIDIA Content Safety", "context": 128000, "max_out": 8192},
    {"id": "kilocode/openrouter/free", "name": "OpenRouter Free (Router)", "context": 200000, "max_out": 8192},
]

def run_test(m):
    payload = json.dumps({
        "model": m["id"],
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 400,
        "temperature": 0.1,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            msg = data.get("choices", [{}])[0].get("message", {})
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning") or ""
            combined = (content or reasoning).strip()
            usage = data.get("usage", {})
            tokens = usage.get("completion_tokens", len(combined.split()))
            has_code = "def binary_search" in combined or "while" in combined
            snippet = combined[:75].replace("\n", " ") if combined else "(empty output)"
            return True, dur, tokens, snippet, has_code, None
    except Exception as e:
        dur = time.time() - t0
        err_msg = str(e)
        if hasattr(e, "read"):
            try:
                b = json.loads(e.read().decode("utf-8"))
                err_msg = b.get("error", {}).get("message", err_msg)
            except:
                pass
        return False, dur, 0, "", False, err_msg

def main():
    print("=" * 125)
    print("REAL BENCHMARK SEMUA MODEL FREE KILO CODE")
    print(f"Endpoint: {URL} | Total Models: {len(MODELS)}")
    print("Tugas: Implementasi Python binary_search(arr, target)")
    print("=" * 125)
    print(f"{'Status':<8} | {'Latensi':<7} | {'Model ID':<52} | {'Context':<8} | {'Max Out':<8} | {'Hasil / Error':<28}")
    print("-" * 125)

    results = []
    for m in MODELS:
        ok, dur, tokens, snippet, has_code, err = run_test(m)
        status = "OK 200" if ok else "ERROR"
        info = snippet if ok else (err[:35] if err else "Failed")
        ctx_str = f"{m['context']//1000}k"
        max_str = f"{m['max_out']//1000}k" if m['max_out'] else "-"
        print(f"{status:<8} | {dur:5.2f}s | {m['id']:<52} | {ctx_str:<8} | {max_str:<8} | {info}")
        results.append({
            "id": m["id"],
            "name": m["name"],
            "context": m["context"],
            "max_out": m["max_out"],
            "ok": ok,
            "duration": dur,
            "tokens": tokens,
            "has_code": has_code,
            "snippet": snippet,
            "error": err
        })
        time.sleep(1.5)

    print("\n" + "=" * 125)
    print("PERINGKAT REAL HASIL BENCHMARK (TERCEPAT -> TERLAMBAT):")
    print("=" * 125)
    success = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    success.sort(key=lambda x: x["duration"])
    for idx, r in enumerate(success, 1):
        quality = "Valid Code" if r["has_code"] else "Output Check"
        ctx_k = f"{r['context']:,} tokens"
        max_k = f"{r['max_out']:,} tokens" if r['max_out'] else "N/A"
        print(f"#{idx:<2} | {r['duration']:5.2f}s | {r['id']:<50} | Ctx: {ctx_k:<14} | Max Out: {max_k:<13} | {quality} ({r['tokens']} tok)")

    if failed:
        print("\nMODEL GAGAL / UPSTREAM RATE LIMIT:")
        for r in failed:
            ctx_k = f"{r['context']:,} tokens"
            print(f"- {r['id']:<50} | Ctx: {ctx_k:<14} | Error ({r['duration']:.2f}s): {r['error']}")

if __name__ == "__main__":
    main()
