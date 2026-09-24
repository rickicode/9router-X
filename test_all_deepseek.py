import urllib.request
import json
import time

URL = "http://192.168.90.101:3777/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT = "Tuliskan 1 baris kode python untuk membalik kata dalam sebuah kalimat."

DEEPSEEK_MODELS = [
    # --- FLASH / V4.1 FLASH CANDIDATES ---
    {"name": "cline-free/deepseek/deepseek-v4.1-flash", "type": "flash"},
    {"name": "cline-free/deepseek/deepseek-v4-flash-0731:free", "type": "flash"},
    {"name": "th/deepseek-v4.1-flash:free", "type": "flash"},
    {"name": "th/deepseek/deepseek-v4-flash", "type": "flash"},
    {"name": "openrouter/deepseek/deepseek-v4-flash-0731:free", "type": "flash"},
    {"name": "orca/deepseek/deepseek-v4-flash-free", "type": "flash"},
    {"name": "orcarouter/deepseek/deepseek-v4.1-flash", "type": "flash"},
    {"name": "uk/deepseek/deepseek-v4-flash", "type": "flash"},
    {"name": "tokenrouter/deepseek/deepseek-v4-flash", "type": "flash"},
    {"name": "cloudflare-ai/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "type": "flash"},

    # --- PRO CANDIDATES ---
    {"name": "uk/deepseek/deepseek-v4-pro", "type": "pro"},
    {"name": "th/deepseek/deepseek-v4-pro", "type": "pro"},
    {"name": "orcarouter/deepseek/deepseek-v4-pro", "type": "pro"},
    {"name": "tokenrouter/deepseek/deepseek-v4-pro", "type": "pro"},
]

def test_model(mid):
    payload = json.dumps({
        "model": mid,
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": 100,
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
            return True, dur, content.strip().replace("\n", " ")[:60], None
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
        return False, dur, "", err_msg[:70]

def run():
    print("="*105)
    print("BENCHMARK SEMUA MODEL DEEPSEEK DI SEMUA PROVIDER")
    print("="*105)
    print(f"{'Type':<6} | {'Model Name':<55} | {'Status':<7} | {'Latency':<8} | {'Cuplikan / Error'}")
    print("-"*105)

    results = []
    for item in DEEPSEEK_MODELS:
        mid = item["name"]
        mtype = item["type"]
        ok, dur, content, err = test_model(mid)
        status_str = "OK 200" if ok else "ERROR"
        info = content if ok else err
        print(f"{mtype:<6} | {mid:<55} | {status_str:<7} | {dur:.2f}s   | {info}")
        results.append({
            "model": mid,
            "type": mtype,
            "ok": ok,
            "duration": dur,
            "info": info
        })
        time.sleep(0.3)

    with open("/tmp/deepseek_bench.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run()
