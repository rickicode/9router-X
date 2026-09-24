import urllib.request
import json
import time

URL = "http://192.168.90.101:3777/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT = "Tuliskan fungsi python singkat untuk mengecek apakah sebuah kata adalah anagram."

CLINE_FREE_MODELS = [
    # Reasoning & LLM Flagships
    {"id": "cline-free/deepseek/deepseek-v4.1-flash", "label": "DeepSeek V4.1 Flash"},
    {"id": "cline-free/deepseek/deepseek-v4-flash-0731:free", "label": "DeepSeek V4 Flash 0731"},
    {"id": "cline-free/moonshotai/kimi-k3", "label": "Moonshot Kimi K3"},
    {"id": "cline-free/z-ai/glm-5.3-flash", "label": "GLM 5.3 Flash"},
    {"id": "cline-free/z-ai/glm-5.2:free", "label": "GLM 5.2"},
    {"id": "cline-free/z-ai/glm-4.7-flash", "label": "GLM 4.7 Flash"},
    {"id": "cline-free/z-ai/glm-4.5", "label": "GLM 4.5"},

    # Coding & Agentic
    {"id": "cline-free/thinkingmachines/inkling:free", "label": "Inkling"},
    {"id": "cline-free/thinkingmachines/inkling-small:free", "label": "Inkling Small"},
    {"id": "cline-free/poolside/laguna-xs-2.1:free", "label": "Laguna XS 2.1"},
    {"id": "cline-free/poolside/laguna-s-2.1:free", "label": "Laguna S 2.1"},
    {"id": "cline-free/cohere/north-mini-code:free", "label": "North Mini Code"},
    {"id": "cline-free/nex-agi/nex-n2.5-pro:free", "label": "Nex N2.5 Pro"},
    {"id": "cline-free/liquid/lfm-2.5-2.6b:free", "label": "LFM 2.5 2.6B"},
    {"id": "cline-free/dots-studio/dots-3-note-preview:free", "label": "Dots 3 Note Preview"},

    # Nvidia / Gemma
    {"id": "cline-free/google/gemma-4-31b-it:free", "label": "Gemma 4 31B IT"},
    {"id": "cline-free/google/gemma-4-26b-a4b-it:free", "label": "Gemma 4 26B A4B IT"},
    {"id": "cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "label": "Nemotron 3 Nano Omni"},
    {"id": "cline-free/nvidia/nemotron-3.5-lightning:free", "label": "Nemotron 3.5 Lightning"},

    # Aggregator
    {"id": "cline-free/openrouter/free", "label": "OpenRouter Free"},
]

def test_model(mid):
    payload = json.dumps({
        "model": mid,
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 120,
        "temperature": 0.1,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return True, dur, len(content), content[:60].replace("\n", " "), None
    except Exception as e:
        dur = time.time() - t0
        msg = str(e)
        try:
            if hasattr(e, "read"):
                body = e.read().decode("utf-8")
                msg = json.loads(body).get("error", {}).get("message", msg)
        except:
            pass
        return False, dur, 0, "", msg[:75]

def run():
    print("="*105)
    print("BENCHMARK SEMUA MODEL CLINE FREE")
    print("="*105)
    print(f"{'Status':<8} | {'Latency':<8} | {'Model ID':<48} | {'Detail / Cuplikan Jawaban'}")
    print("-"*105)

    results = []
    for m in CLINE_FREE_MODELS:
        mid = m["id"]
        label = m["label"]
        ok, dur, out_len, snippet, err = test_model(mid)
        status_str = "OK 200" if ok else "ERROR"
        info = snippet if ok else err
        print(f"{status_str:<8} | {dur:.2f}s   | {mid:<48} | {info}")
        results.append({
            "id": mid,
            "label": label,
            "ok": ok,
            "duration": dur,
            "out_len": out_len,
            "info": info
        })
        time.sleep(0.3)

    # Sorting
    active_models = [r for r in results if r["ok"]]
    active_models.sort(key=lambda x: x["duration"])

    print("\n\n" + "="*105)
    print("PERINGKAT MODEL AKTIF CLINE FREE (TERCEPAT -> TERLAMBAT)")
    print("="*105)
    print(f"{'Rank':<5} | {'Latency':<8} | {'Model ID':<48} | {'Chars':<7} | {'Label'}")
    print("-"*105)
    for i, r in enumerate(active_models, 1):
        print(f"#{i:<4} | {r['duration']:.2f}s   | {r['id']:<48} | {r['out_len']:<7} | {r['label']}")

    with open("/tmp/cline_free_bench.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run()
