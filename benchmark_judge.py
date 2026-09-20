import urllib.request
import json
import time
import re

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

SYSTEM_PROMPT = """You are a classification judge. Classify the task difficulty into easy, medium, or hard.
Reply with ONLY a valid JSON object matching this schema:
{"difficulty": "easy" | "medium" | "hard", "confidence": 0.0 - 1.0}"""

TEST_CASES = [
    # --- 5 EASY TASKS ---
    {"id": "E1", "category": "EASY", "name": "Casual Greeting", "task": "Halo bro, apa kabar?", "exp": "easy"},
    {"id": "E2", "category": "EASY", "name": "Current Time", "task": "Sekarang jam berapa ya?", "exp": "easy"},
    {"id": "E3", "category": "EASY", "name": "Typo / Syntax Fix", "task": "tolong fix [Recent tool: SyntaxError: Unexpected token ) in calc.js line 5]", "exp": "easy"},
    {"id": "E4", "category": "EASY", "name": "CSS Center Div", "task": "gimana cara bikin div center pake tailwind css?", "exp": "easy"},
    {"id": "E5", "category": "EASY", "name": "Regex Email", "task": "bikinin regex buat validasi format email standar", "exp": "easy"},

    # --- 5 MEDIUM TASKS ---
    {"id": "M1", "category": "MEDIUM", "name": "Jest Unit Test", "task": "tulis unit test jest buat fungsi calculateTax(income, maritalStatus)", "exp": "medium"},
    {"id": "M2", "category": "MEDIUM", "name": "Parse CSV Logic", "task": "refactor fungsi parsing CSV ini biar handle escaped commas dan empty lines", "exp": "medium"},
    {"id": "M3", "category": "MEDIUM", "name": "Postgres Aggregate", "task": "tulis query postgresql untuk group by user dan hitung total order per bulan", "exp": "medium"},
    {"id": "M4", "category": "MEDIUM", "name": "Express S3 Upload", "task": "buat express.js endpoint untuk upload multipart file ke S3 pake multer", "exp": "medium"},
    {"id": "M5", "category": "MEDIUM", "name": "React Hook Fix", "task": "tolong perbaiki [Recent tool: TypeError: Cannot read properties of undefined (reading 'map') in ProductList]", "exp": "medium"},

    # --- 5 HARD TASKS ---
    {"id": "H1", "category": "HARD", "name": "Microservices Arch", "task": "desain arsitektur event-driven microservices dengan Kafka, transactional outbox, dan CDC Debezium", "exp": "hard"},
    {"id": "H2", "category": "HARD", "name": "Distributed Deadlock", "task": "tolong fix [Recent tool: Deadlock detected in distributed lock manager mutex_worker_3 holding lock_order_19 while waiting for lock_account_42]", "exp": "hard"},
    {"id": "H3", "category": "HARD", "name": "Production Memory Leak", "task": "aplikasi node.js kami leak memory 2GB setiap 1 jam di production, heap snapshot nunjukin Closure retainers di event emitter", "exp": "hard"},
    {"id": "H4", "category": "HARD", "name": "Zero-Knowledge Crypto", "task": "audit implementasi Zero-Knowledge Proof dan verify zk-SNARK verifier contract ini terhadap replay attack", "exp": "hard"},
    {"id": "H5", "category": "HARD", "name": "DB Sharding Migration", "task": "rewrite and refactor entire monolithic database schema migration from MySQL 5.7 to sharded CockroachDB", "exp": "hard"},
]

CANDIDATES = [
    {"label": "Gemini 3.1 Flash Lite (Unikey)", "model": "unikey/google/gemini-3.1-flash-lite"},
    {"label": "Llama 3.2 3B (Cloudflare AI)", "model": "cloudflare-ai/@cf/meta/llama-3.2-3b-instruct"},
    {"label": "Llama 3.1 8B (Cloudflare AI)", "model": "cloudflare-ai/@cf/meta/llama-3.1-8b-instruct-fp8"},
    {"label": "Qwen 2.5 Coder 32B (Cloudflare AI)", "model": "cloudflare-ai/@cf/qwen/qwen2.5-coder-32b-instruct"},
]

def query_model(model_id, prompt):
    payload = json.dumps({
        "model": model_id,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Task to classify: {prompt}"}
        ],
        "temperature": 0.1,
        "max_tokens": 80,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return content, dur, None
    except Exception as e:
        dur = time.time() - t0
        return "", dur, str(e)

def parse_difficulty(text):
    if not text:
        return None
    if isinstance(text, dict):
        d = str(text.get("difficulty", "")).lower()
        if d in ["easy", "medium", "hard"]:
            return d
        text = json.dumps(text)
    # 1. JSON parse
    try:
        m = re.search(r"\{[\s\S]*?\}", str(text))
        if m:
            obj = json.loads(m.group(0))
            d = str(obj.get("difficulty", "")).lower()
            if d in ["easy", "medium", "hard"]:
                return d
    except:
        pass
    # 2. Regex fallback
    m = re.search(r"\b(easy|medium|hard)\b", str(text), re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return None
def run_benchmark():
    all_results = {}
    for cand in CANDIDATES:
        c_label = cand["label"]
        c_model = cand["model"]
        print(f"\n==========================================")
        print(f"BENCHMARKING: {c_label}")
        print(f"Model ID: {c_model}")
        print(f"==========================================")
        results = []
        for tc in TEST_CASES:
            content, dur, err = query_model(c_model, tc["task"])
            parsed = parse_difficulty(content)
            is_match = (parsed == tc["exp"]) or (tc["exp"] == "easy/medium" and parsed in ["easy", "medium"])
            status_icon = "CORRECT" if is_match else ("MISMATCH" if parsed else "FAILED")
            
            print(f"[{tc['id']:<2}] {tc['category']:<6} | {tc['name']:<22} | Exp: {tc['exp']:<6} | Got: {str(parsed):<6} | {dur:.2f}s | {status_icon}")
            results.append({
                "tc": tc,
                "parsed": parsed,
                "is_match": is_match,
                "duration": dur,
                "raw": content,
                "error": err
            })
            time.sleep(0.2)
        all_results[c_label] = results

    # Print Summary
    print("\n\n" + "="*80)
    print("FINAL BENCHMARK COMPARISON MATRIX (15 REAL-WORLD TASKS)")
    print("="*80)
    print(f"{'Model':<36} | {'Accuracy':<10} | {'Avg Latency':<12} | {'Min / Max':<14} | {'Format JSON'}")
    print("-"*80)
    for c_label, res in all_results.items():
        total = len(res)
        correct = sum(1 for r in res if r["is_match"])
        parsed_ok = sum(1 for r in res if r["parsed"] is not None)
        durations = [r["duration"] for r in res]
        avg_dur = sum(durations) / total
        min_dur = min(durations)
        max_dur = max(durations)
        acc_pct = f"{correct}/{total} ({int(correct/total*100)}%)"
        lat_str = f"{avg_dur:.2f}s"
        min_max = f"{min_dur:.2f}s / {max_dur:.2f}s"
        json_rate = f"{parsed_ok}/{total}"
        print(f"{c_label:<36} | {acc_pct:<10} | {lat_str:<12} | {min_max:<14} | {json_rate}")

    with open("/tmp/benchmark_results.json", "w") as f:
        json.dump(all_results, f, indent=2)

if __name__ == "__main__":
    run_benchmark()
