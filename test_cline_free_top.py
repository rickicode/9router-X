import urllib.request
import json
import time

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT = "Tuliskan kode python fungsi binary search yang singkat."

MODELS = [
    # All DeepSeek models under cline-free
    ("DeepSeek V4 Flash 0731", "cline-free/deepseek/deepseek-v4-flash-0731"),
    ("DeepSeek V4 Flash", "cline-free/deepseek/deepseek-v4-flash"),
    ("DeepSeek Flash Latest (~)", "cline-free/~deepseek/deepseek-flash-latest"),
    ("DeepSeek V4 Flash Latest (~)", "cline-free/~deepseek/deepseek-v4-flash-latest"),
    ("DeepSeek V4 Flash 0731 Free", "cline-free/deepseek/deepseek-v4-flash-0731:free"),
    ("DeepSeek V4.1 Flash", "cline-free/deepseek/deepseek-v4.1-flash"),

    # Flagship Kimi, GLM, Gemma, Poolside
    ("Kimi K3 (Moonshot)", "cline-free/moonshotai/kimi-k3"),
    ("GLM 5.3 Flash", "cline-free/z-ai/glm-5.3-flash"),
    ("GLM 4.7 Flash", "cline-free/z-ai/glm-4.7-flash"),
    ("GLM 5.2 Free", "cline-free/z-ai/glm-5.2:free"),
    ("Gemma 4 31B IT Free", "cline-free/google/gemma-4-31b-it:free"),
    ("Gemma 4 26B A4B IT Free", "cline-free/google/gemma-4-26b-a4b-it:free"),
    ("Laguna S 2.1 Free (Poolside)", "cline-free/poolside/laguna-s-2.1:free"),
    ("Laguna XS 2.1 Free (Poolside)", "cline-free/poolside/laguna-xs-2.1:free"),
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
        with urllib.request.urlopen(req, timeout=18) as resp:
            dur = time.time() - t0
            raw = json.loads(resp.read().decode("utf-8"))
            content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
            return True, dur, content.strip().replace("\n", " ")[:65], None
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
        return False, dur, "", err_msg

def main():
    print("="*105)
    print("BENCHMARK SEMUA MODEL TOP & DEEPSEEK DI CLINE FREE")
    print("="*105)
    print(f"{'Status':<8} | {'Latensi':<8} | {'Model ID':<46} | {'Detail / Cuplikan'}")
    print("-"*105)

    results = []
    for label, mid in MODELS:
        ok, dur, snippet, err = test_model(mid)
        status_str = "OK 200" if ok else "ERROR"
        info = snippet if ok else err[:45]
        print(f"{status_str:<8} | {dur:.2f}s   | {mid:<46} | {info}")
        results.append({
            "label": label,
            "id": mid,
            "ok": ok,
            "duration": dur,
            "snippet": snippet,
            "error": err
        })
        time.sleep(0.4)

    active = [r for r in results if r["ok"]]
    active.sort(key=lambda x: x["duration"])

    print("\n\n" + "="*105)
    print("PERINGKAT MODEL AKTIF (TERCEPAT -> TERLAMBAT)")
    print("="*105)
    print(f"{'Rank':<5} | {'Latensi':<8} | {'Model ID':<46} | {'Label'}")
    print("-"*105)
    for i, r in enumerate(active, 1):
        print(f"#{i:<4} | {r['duration']:.2f}s   | {r['id']:<46} | {r['label']}")

    with open("/tmp/cline_free_deepseek_bench.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
