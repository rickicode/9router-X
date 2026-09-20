import urllib.request
import json
import time

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

# Real coding task: LRU Cache implementation
CODING_PROMPT = """Tuliskan implementasi class LRUCache di Python dengan kapasitas `capacity`.
Method: `get(key)` dan `put(key, value)` yang berjalan dalam kompleksitas waktu O(1).
Tuliskan langsung kodenya dengan komentar singkat."""

# AI Coding specific models on Cline Free
CODING_MODELS = [
    {"id": "cline-free/deepseek/deepseek-v4.1-flash", "name": "DeepSeek V4.1 Flash", "desc": "DeepSeek Flagship Coding"},
    {"id": "cline-free/deepseek/deepseek-v4-flash-0731:free", "name": "DeepSeek V4 Flash 0731", "desc": "DeepSeek Coding Free"},
    {"id": "cline-free/z-ai/glm-5.3-flash", "name": "GLM 5.3 Flash", "desc": "Z.ai Agentic Coding Flagship"},
    {"id": "cline-free/cohere/north-mini-code:free", "name": "North Mini Code", "desc": "Cohere Dedicated Code Model"},
    {"id": "cline-free/poolside/laguna-s-2.1:free", "name": "Laguna S 2.1", "desc": "Poolside Software Eng Model"},
    {"id": "cline-free/poolside/laguna-xs-2.1:free", "name": "Laguna XS 2.1", "desc": "Poolside Fast SE Model"},
    {"id": "cline-free/thinkingmachines/inkling:free", "name": "Inkling", "desc": "ThinkingMachines Coding/Agent"},
    {"id": "cline-free/thinkingmachines/inkling-small:free", "name": "Inkling Small", "desc": "ThinkingMachines Fast Code"},
    {"id": "cline-free/nex-agi/nex-n2.5-pro:free", "name": "Nex N2.5 Pro", "desc": "Nex AGI Coding/Reasoning"},
    {"id": "cline-free/moonshotai/kimi-k3", "name": "Moonshot Kimi K3", "desc": "Kimi K3 Coding/Reasoning"},
]

def query_code(model_id):
    payload = json.dumps({
        "model": model_id,
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
        with urllib.request.urlopen(req, timeout=30) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return True, dur, len(content), content[:120].replace("\n", " "), None
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
    print("="*105)
    print("BENCHMARK KHUSUS MODEL AI CODING DI CLINE FREE")
    print("Task: Implementasi LRU Cache Python O(1)")
    print("="*105)
    print(f"{'Status':<8} | {'Latensi':<8} | {'Model ID':<45} | {'Deskripsi':<26}")
    print("-"*105)

    results = []
    for m in CODING_MODELS:
        mid = m["id"]
        ok, dur, length, snippet, err = query_code(mid)
        status_str = "OK 200" if ok else "ERROR"
        info = snippet if ok else err[:50]
        print(f"{status_str:<8} | {dur:.2f}s   | {mid:<45} | {m['desc']:<26}")
        results.append({
            "id": mid,
            "name": m["name"],
            "desc": m["desc"],
            "ok": ok,
            "duration": dur,
            "length": length,
            "snippet": snippet,
            "error": err
        })
        time.sleep(0.5)

    active = [r for r in results if r["ok"]]
    active.sort(key=lambda x: x["duration"])

    print("\n\n" + "="*105)
    print("HASIL PERINGKAT MODEL CODING TERBAIK & TERCEPAT (AKTIF)")
    print("="*105)
    print(f"{'Rank':<5} | {'Latensi':<8} | {'Model ID':<45} | {'Karakter':<8} | {'Cuplikan Kode'}")
    print("-"*105)
    for i, r in enumerate(active, 1):
        print(f"#{i:<4} | {r['duration']:.2f}s   | {r['id']:<45} | {r['length']:<8} | {r['snippet'][:55]}")

    if len(results) > len(active):
        print("\n" + "-"*105)
        print("MODEL CODING YANG GAGAL / LIMIT / UNAVAILABLE:")
        print("-"*105)
        for r in results:
            if not r["ok"]:
                print(f"- {r['id']:<45} : {r['error']}")

if __name__ == "__main__":
    main()
