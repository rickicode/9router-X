import urllib.request
import json
import time
import re

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

# Exact prompt used by axonrouter open-sse/services/combo.js
DIFFICULTY_JUDGE_PROMPT = """Classify this task. Reply with ONLY JSON, no markdown:
{"difficulty":"easy|medium|hard","ambiguity":"low|medium|high","domain":"general|summary|coding|design|data","confidence":0.0-1.0}
Task: """

TEST_CASES = [
    # 5 EASY
    {"id": "E1", "category": "EASY", "name": "Casual Greeting", "task": "Halo bro, apa kabar?", "exp": "easy"},
    {"id": "E2", "category": "EASY", "name": "Current Time", "task": "Sekarang jam berapa ya?", "exp": "easy"},
    {"id": "E3", "category": "EASY", "name": "Typo / Syntax Fix", "task": "tolong fix [Recent tool: SyntaxError: Unexpected token ) in calc.js line 5]", "exp": "easy"},
    {"id": "E4", "category": "EASY", "name": "CSS Center Div", "task": "gimana cara bikin div center pake tailwind css?", "exp": "easy"},
    {"id": "E5", "category": "EASY", "name": "Regex Email", "task": "bikinin regex buat validasi format email standar", "exp": "easy"},

    # 5 MEDIUM
    {"id": "M1", "category": "MEDIUM", "name": "Jest Unit Test", "task": "tulis unit test jest buat fungsi calculateTax(income, maritalStatus)", "exp": "medium"},
    {"id": "M2", "category": "MEDIUM", "name": "Parse CSV Logic", "task": "refactor fungsi parsing CSV ini biar handle escaped commas dan empty lines", "exp": "medium"},
    {"id": "M3", "category": "MEDIUM", "name": "Postgres Aggregate", "task": "tulis query postgresql untuk group by user dan hitung total order per bulan", "exp": "medium"},
    {"id": "M4", "category": "MEDIUM", "name": "Express S3 Upload", "task": "buat express.js endpoint untuk upload multipart file ke S3 pake multer", "exp": "medium"},
    {"id": "M5", "category": "MEDIUM", "name": "React Hook Fix", "task": "tolong perbaiki [Recent tool: TypeError: Cannot read properties of undefined (reading 'map') in ProductList]", "exp": "medium"},

    # 5 HARD
    {"id": "H1", "category": "HARD", "name": "Microservices Arch", "task": "desain arsitektur event-driven microservices dengan Kafka, transactional outbox, dan CDC Debezium", "exp": "hard"},
    {"id": "H2", "category": "HARD", "name": "Distributed Deadlock", "task": "tolong fix [Recent tool: Deadlock detected in distributed lock manager mutex_worker_3 holding lock_order_19 while waiting for lock_account_42]", "exp": "hard"},
    {"id": "H3", "category": "HARD", "name": "Production Memory Leak", "task": "aplikasi node.js kami leak memory 2GB setiap 1 jam di production, heap snapshot nunjukin Closure retainers di event emitter", "exp": "hard"},
    {"id": "H4", "category": "HARD", "name": "Zero-Knowledge Crypto", "task": "audit implementasi Zero-Knowledge Proof dan verify zk-SNARK verifier contract ini terhadap replay attack", "exp": "hard"},
    {"id": "H5", "category": "HARD", "name": "DB Sharding Migration", "task": "rewrite and refactor entire monolithic database schema migration from MySQL 5.7 to sharded CockroachDB", "exp": "hard"},
]

CANDIDATES = [
    {"label": "Gemini 3.1 Flash Lite (Unikey)", "model": "unikey/google/gemini-3.1-flash-lite", "max_tokens": 60},
    {"label": "MiMo V2.5 Free (OpenCode)", "model": "oc/mimo-v2.5-free", "max_tokens": 150},
    {"label": "Llama 3.2 3B (Cloudflare AI)", "model": "cloudflare-ai/@cf/meta/llama-3.2-3b-instruct", "max_tokens": 60},
    {"label": "Llama 3.2 1B (Cloudflare AI)", "model": "cloudflare-ai/@cf/meta/llama-3.2-1b-instruct", "max_tokens": 60},
    {"label": "Llama 3.1 8B (Cloudflare AI)", "model": "cloudflare-ai/@cf/meta/llama-3.1-8b-instruct-fp8", "max_tokens": 60},
]

def query_model(model_id, prompt, max_tokens):
    user_prompt = f"{DIFFICULTY_JUDGE_PROMPT}{prompt}"
    payload = json.dumps({
        "model": model_id,
        "messages": [{"role": "user", "content": user_prompt}],
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content", "")
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
    try:
        m = re.search(r"\{[\s\S]*?\}", str(text))
        if m:
            obj = json.loads(m.group(0))
            d = str(obj.get("difficulty", "")).lower()
            if d in ["easy", "medium", "hard"]:
                return d
    except:
        pass
    m = re.search(r"\b(easy|medium|hard)\b", str(text), re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return None

def run():
    all_res = {}
    for c in CANDIDATES:
        label = c["label"]
        mid = c["model"]
        mt = c["max_tokens"]
        print(f"\n==========================================")
        print(f"BENCHMARKING: {label}")
        print(f"Model: {mid}")
        print(f"==========================================")
        results = []
        for tc in TEST_CASES:
            content, dur, err = query_model(mid, tc["task"], mt)
            parsed = parse_difficulty(content)
            is_match = (parsed == tc["exp"]) or (tc["exp"] == "easy/medium" and parsed in ["easy", "medium"])
            tag = "CORRECT" if is_match else ("MISMATCH" if parsed else "FAILED")
            raw_preview = (content or err or "")[:35].replace("\n", " ")
            print(f"[{tc['id']:<2}] {tc['category']:<6} | {tc['name']:<22} | Exp: {tc['exp']:<6} | Got: {str(parsed):<6} | {dur:.2f}s | {tag:<8} | Raw: {raw_preview}")
            results.append({
                "tc": tc,
                "parsed": parsed,
                "is_match": is_match,
                "duration": dur,
                "content": content,
                "error": err
            })
            time.sleep(0.2)
        all_res[label] = results

    print("\n\n" + "="*95)
    print("HASIL PERBANDINGAN BENCHMARK FINAL (15 KASUS PRODUKSI)")
    print("="*95)
    print(f"{'Model':<35} | {'Easy':<5} | {'Med':<5} | {'Hard':<5} | {'Total':<10} | {'Avg Lat':<8} | {'Min/Max':<13} | {'Valid JSON'}")
    print("-"*95)
    for label, res in all_res.items():
        easy_ok = sum(1 for r in res if r["tc"]["category"] == "EASY" and r["is_match"])
        med_ok = sum(1 for r in res if r["tc"]["category"] == "MEDIUM" and r["is_match"])
        hard_ok = sum(1 for r in res if r["tc"]["category"] == "HARD" and r["is_match"])
        tot_ok = sum(1 for r in res if r["is_match"])
        parsed_ok = sum(1 for r in res if r["parsed"] is not None)
        durs = [r["duration"] for r in res]
        avg_t = sum(durs) / len(durs)
        min_t = min(durs)
        max_t = max(durs)
        print(f"{label:<35} | {easy_ok}/5 | {med_ok}/5 | {hard_ok}/5 | {tot_ok}/15 ({int(tot_ok/15*100)}%) | {avg_t:.2f}s   | {min_t:.2f}s/{max_t:.2f}s | {parsed_ok}/15")

if __name__ == "__main__":
    run()
