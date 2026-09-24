#!/usr/bin/env python3
"""
AxonRouter Comprehensive Benchmark CLI Tool
Evaluates all available native models across active providers:
- Excludes custom providers and non-chat endpoints.
- Tests:
  1. Latency & Availability (Ping / TTFT)
  2. Heavy Coding WITH TOOL CALLS (TokenBucketRateLimiter + Tool Call Leak Detection)
  3. Creative Indonesian Writing (Cerita Horor Kantor Lantai 13 Sudirman)
  4. Complex Logic & Deductive Reasoning (Multi-constraint Puzzle)
- Captures Context Window, Max Output Tokens, and Tool Call Fidelity.
- Persists to SQLite (benchmark_store.db) and JSON (benchmark_results.json).
"""

import argparse
import ast
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

DEFAULT_GATEWAY = os.environ.get("ROUTER_URL", "http://192.168.90.101:3777")
DEFAULT_KEY = os.environ.get("ROUTER_API_KEY", "sk-1913e25d85487647-bkjq1z-e0b63207")
OUTPUT_JSON = "benchmark_results.json"
REPORT_MD = "BENCHMARK_REPORT.md"
SQLITE_DB = "benchmark_store.db"

CUSTOM_PROVIDERS = {
    'cavoti', 'thegrid', 'atria', 'kiosapi', 'xpiki', 'apinex', 'kiyararouter',
    'jina-reader', 'ollama-search', 'tavily', 'brave-search', 'exa', 'firecrawl',
    'nanobanana', 'kiraai', 'kiro', 'freebuff', 'combo', 'default'
}

EXCLUDE_KEYWORDS = [
    'embedding', 'bge-', 'clip', 'tts', 'speech', 'whisper', 'flux',
    'stable-diffusion', 'dall-e', 'midjourney', 'sora', 'veo', 'kling',
    'minimax-video', 'moderation', 'rerank'
]

# Prompts & Tools
PROMPT_PING = "Jawab singkat satu kata saja: 'PONG'"

EXECUTE_CODE_TOOL = [
    {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Eksekusi kode Python di sandbox terisolasi dan kembalikan hasil output stdout.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Kode Python lengkap siap pakai."
                    }
                },
                "required": ["code"]
            }
        }
    }
]

PROMPT_CODING = """Tuliskan implementasi lengkap sistem TokenBucketRateLimiter di Python yang thread-safe menggunakan threading.Lock.
Spesifikasi:
1. Class `TokenBucketRateLimiter(capacity: int, refill_rate: float)`.
2. Method `consume(tokens: int = 1) -> bool`.
3. Method `time_until_next_available(tokens: int = 1) -> float`.
4. Refill berbasis timestamp (lazy refill).
5. Sertakan contoh pemanggilan kode.

PENTING: Kamu HARUS memanggil tool `execute_code` dan meletakkan kode Python tersebut di argumen `code`."""

PROMPT_HORROR = """Tuliskan cerita horor pendek (3-4 paragraf) dalam Bahasa Indonesia dengan latar di lantai 13 gedung kantor tua kawasan Sudirman Jakarta saat lembur sendirian lewat tengah malam.
Bangun atmosfer mencekam, suspense yang intens, diksi deskriptif yang kaya, dan akhiri dengan plot twist mengejutkan."""

PROMPT_REASONING = """Empat orang (Andi, Budi, Citra, Doni) memiliki profesi (Dokter, Guru, Insinyur, Pengacara) dan mobil berwarna berbeda (Merah, Biru, Hitam, Putih).
1. Dokter memiliki mobil Merah.
2. Guru bukan Andi dan bukan Citra.
3. Budi adalah Insinyur, tetapi mobilnya bukan Hitam dan bukan Putih.
4. Doni tidak memiliki mobil Putih.
Siapakah yang memiliki mobil Putih dan apa profesinya? Jelaskan langkah eliminasi deduksi logismu secara terstruktur dan berikan kesimpulan akhir."""


def init_sqlite_db():
    conn = sqlite3.connect(SQLITE_DB)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS model_benchmarks (
        model_id TEXT PRIMARY KEY,
        provider TEXT,
        base_model TEXT,
        is_free INTEGER,
        context_length INTEGER,
        max_output_tokens INTEGER,
        ping_ok INTEGER,
        ping_duration REAL,
        ping_status INTEGER,
        ping_error TEXT,
        ping_text TEXT,
        coding_ok INTEGER,
        coding_score INTEGER,
        coding_duration REAL,
        coding_tokens INTEGER,
        tool_call_status TEXT,
        tool_call_leak INTEGER,
        coding_eval TEXT,
        coding_code TEXT,
        horror_ok INTEGER,
        horror_score INTEGER,
        horror_duration REAL,
        horror_tokens INTEGER,
        horror_eval TEXT,
        horror_text TEXT,
        reasoning_ok INTEGER,
        reasoning_score INTEGER,
        reasoning_duration REAL,
        reasoning_tokens INTEGER,
        reasoning_eval TEXT,
        reasoning_text TEXT,
        total_score INTEGER,
        tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    return conn


def fetch_available_models_meta(gateway, key):
    url = f"{gateway.rstrip('/')}/v1/models"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models_list = data.get("data", [])
    except Exception as e:
        print(f"[ERROR] Failed to fetch /v1/models from {gateway}: {e}", file=sys.stderr)
        return {}

    meta_map = {}
    for m in models_list:
        mid = m.get("id", "")
        if "/" not in mid:
            continue
        p = mid.split("/")[0]
        if p.lower() in CUSTOM_PROVIDERS or any(hex_id in p for hex_id in ["-chat-", "50d8", "9f6e", "a3d0", "e14f"]):
            continue
        if any(k in mid.lower() for k in EXCLUDE_KEYWORDS):
            continue
        caps = m.get("capabilities") or {}
        ctx = m.get("context_length") or caps.get("contextWindow") or 0
        max_out = m.get("max_completion_tokens") or caps.get("maxOutput") or 0
        meta_map[mid] = {
            "id": mid,
            "provider": p,
            "context_length": ctx,
            "max_output_tokens": max_out,
            "capabilities": caps
        }
    return meta_map


def request_chat(gateway, key, model, prompt, max_tokens=300, temperature=0.2, timeout=35, tools=None):
    url = f"{gateway.rstrip('/')}/v1/chat/completions"
    payload_dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False
    }
    if tools:
        payload_dict["tools"] = tools

    payload = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8").strip()
            data = {}
            try:
                data = json.loads(raw)
            except Exception:
                # Fallback: find first valid JSON block
                for line in raw.split("\n"):
                    line_s = line.strip()
                    if line_s.startswith("{"):
                        try:
                            data = json.loads(line_s)
                            break
                        except Exception:
                            pass
            if "data" in data and isinstance(data["data"], dict) and "choices" in data["data"]:
                data = data["data"]
            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning") or msg.get("reasoning_content") or ""
            tool_calls = msg.get("tool_calls") or []
            finish_reason = choice.get("finish_reason") or ""
            full_text = (content or reasoning).strip()
            usage = data.get("usage", {})
            tokens = usage.get("completion_tokens", len(full_text.split()))

            # Check for false 200 responses
            lower_text = full_text.lower()
            false_200_markers = [
                "no longer available", "is deprecated", "insufficient balance",
                "verify your account", "credits required", "add credits to continue",
                "temporarily unavailable", "unauthorized", "quota exceeded"
            ]
            if not full_text and not tool_calls:
                return {
                    "ok": False,
                    "duration": round(dur, 2),
                    "tokens": 0,
                    "text": "",
                    "tool_calls": [],
                    "finish_reason": finish_reason,
                    "status": 500,
                    "error": "empty response content"
                }

            if any(marker in lower_text for marker in false_200_markers) and not tool_calls:
                return {
                    "ok": False,
                    "duration": round(dur, 2),
                    "tokens": tokens,
                    "text": full_text,
                    "tool_calls": [],
                    "finish_reason": finish_reason,
                    "status": 400,
                    "error": full_text[:60]
                }

            return {
                "ok": True,
                "duration": round(dur, 2),
                "tokens": tokens,
                "text": full_text,
                "tool_calls": tool_calls,
                "finish_reason": finish_reason,
                "status": 200,
                "error": None
            }
    except Exception as e:
        dur = time.time() - t0
        err_msg = str(e)
        status_code = getattr(e, "code", 500)
        if hasattr(e, "read"):
            try:
                b = json.loads(e.read().decode("utf-8"))
                err_msg = b.get("error", {}).get("message", err_msg)
            except:
                pass
        return {
            "ok": False,
            "duration": round(dur, 2),
            "tokens": 0,
            "text": "",
            "tool_calls": [],
            "finish_reason": "",
            "status": status_code,
            "error": str(err_msg)
        }


def eval_coding_with_tools(res):
    if not res.get("ok"):
        return {
            "score": 0,
            "status": "ERROR",
            "leak": 0,
            "eval": res.get("error") or "Request failed",
            "code": ""
        }

    tool_calls = res.get("tool_calls", [])
    content = res.get("text", "")
    code = ""
    status = "IGNORED_TOOL"
    leak = 0
    score = 0
    reasons = []

    # Check for leaked tool call syntax in text
    leak_patterns = [
        r"<tool_call>", r"</tool_call>",
        r"<function=\w+", r"</function>",
        r"\{\s*\"name\"\s*:\s*\"execute_code\"",
        r"```json\s*\{\s*\"name\"\s*:\s*\"execute_code\"",
        r"call:execute_code"
    ]
    has_leak = any(re.search(pat, content, re.IGNORECASE) for pat in leak_patterns)

    if tool_calls and len(tool_calls) > 0:
        status = "NATIVE_OK"
        score += 30
        reasons.append("Tool call native OK (+30)")
        tc = tool_calls[0]
        args_str = tc.get("function", {}).get("arguments", "")
        try:
            args = json.loads(args_str) if isinstance(args_str, str) else args_str
            code = args.get("code", "")
        except Exception:
            code = args_str
    elif has_leak:
        status = "LEAKED_TO_CONTENT"
        leak = 1
        score += 5  # Severe penalty for leaking into content
        reasons.append("BOCOR: Tool call bocor ke teks mentah (+5)")
        # Extract code from leak
        m = re.search(r'"code"\s*:\s*"([^"]+)"', content)
        if m:
            code = m.group(1).encode().decode('unicode-escape', errors='ignore')
        else:
            code = content
    else:
        status = "IGNORED_TOOL"
        score += 15  # Fallback to pure text without using tools
        reasons.append("Mengabaikan tool call (+15)")
        code = content

    # If code is still empty, search for code blocks in content
    if not code:
        code = content

    # Inspect code logic & syntax
    if "TokenBucketRateLimiter" in code or "TokenBucket" in code:
        score += 20
        reasons.append("Class TokenBucket (+20)")
    if "def consume" in code:
        score += 20
        reasons.append("Method consume (+20)")
    if "time_until_next_available" in code or "time_until" in code:
        score += 10
        reasons.append("Method time_until (+10)")
    if "Lock" in code or "threading" in code:
        score += 10
        reasons.append("threading.Lock thread-safe (+10)")
    if "time.time" in code or "timestamp" in code:
        score += 10
        reasons.append("Lazy refill timestamp (+10)")

    # Test AST parsing
    snippets = []
    if "```python" in code:
        for p in code.split("```python")[1:]:
            snippets.append(p.split("```")[0])
    elif "```" in code:
        parts = code.split("```")
        for i in range(1, len(parts), 2):
            snippets.append(parts[i])
    else:
        snippets.append(code)

    for snip in snippets:
        try:
            ast.parse(snip.strip())
            reasons.append("Valid Python AST")
            break
        except Exception:
            pass
    final_score = min(100, score)
    return {
        "score": final_score,
        "status": status,
        "leak": leak,
        "eval": ", ".join(reasons),
        "code": code[:1000]
    }


def eval_horror(text):
    if not text or len(text) < 50:
        return 0, "Output too short"
    score = 50
    reasons = []
    lower = text.lower()

    keywords = ["lantai 13", "sudirman", "sunyi", "dingin", "langkah", "lift", "lampu", "bayangan", "jendela", "malam", "nafas", "keringat", "pintu"]
    matches = sum(1 for k in keywords if k in lower)
    kw_score = min(25, matches * 4)
    score += kw_score
    reasons.append(f"{matches} atmosphere keywords")

    paras = [p for p in text.split("\n\n") if len(p.strip()) > 30]
    if len(paras) >= 3:
        score += 15
        reasons.append(f"{len(paras)} structured paragraphs")

    indo_markers = ["yang", "di", "dan", "dengan", "saat", "ketika", "namun", "seperti", "hanya"]
    indo_count = sum(1 for m in indo_markers if f" {m} " in lower)
    if indo_count >= 5:
        score += 10
        reasons.append("Natural Indonesian flow")

    return min(100, score), ", ".join(reasons)


def eval_reasoning(text):
    if not text:
        return 0, "No output"
    score = 0
    reasons = []
    lower = text.lower()

    has_pengacara = "pengacara" in lower or "lawyer" in lower
    has_putih = "putih" in lower or "white" in lower
    if has_pengacara and has_putih:
        score += 50
        reasons.append("Deduction OK (Pengacara = Putih)")

    if "budi" in lower and ("biru" in lower or "blue" in lower):
        score += 20
        reasons.append("Budi = Biru")

    if "doni" in lower and ("guru" in lower or "hitam" in lower):
        score += 20
        reasons.append("Doni = Guru/Hitam")

    if any(s in text for s in ["1.", "2.", "Langkah", "Eliminasi", "Kesimpulan"]):
        score += 10
        reasons.append("Structured deduction steps")

    return min(100, score), ", ".join(reasons)


def sync_result_to_sqlite(model_id, data, meta):
    try:
        conn = init_sqlite_db()
        c = conn.cursor()
        prov = data.get("provider") or model_id.split("/")[0]
        base_name = model_id.split("/", 1)[-1].replace(":free", "")
        is_free = 1 if (":free" in model_id or "-free" in model_id or "free" in prov) else 0

        ctx = meta.get("context_length", 0)
        max_out = meta.get("max_output_tokens", 0)

        p = data.get("ping", {})
        c_res = data.get("coding", {})
        h_res = data.get("horror", {})
        r_res = data.get("reasoning", {})

        tot = (c_res.get("score") or 0) + (h_res.get("score") or 0) + (r_res.get("score") or 0)

        c.execute("""
        INSERT OR REPLACE INTO model_benchmarks (
            model_id, provider, base_model, is_free, context_length, max_output_tokens,
            ping_ok, ping_duration, ping_status, ping_error, ping_text,
            coding_ok, coding_score, coding_duration, coding_tokens, tool_call_status, tool_call_leak, coding_eval, coding_code,
            horror_ok, horror_score, horror_duration, horror_tokens, horror_eval, horror_text,
            reasoning_ok, reasoning_score, reasoning_duration, reasoning_tokens, reasoning_eval, reasoning_text,
            total_score, tested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            model_id, prov, base_name, is_free, ctx, max_out,
            1 if p.get("ok") else 0, p.get("duration", 0), p.get("status", 0), p.get("error", ""), p.get("text", ""),
            1 if c_res.get("ok") else 0, c_res.get("score", 0), c_res.get("duration", 0), c_res.get("tokens", 0),
            c_res.get("tool_call_status", ""), c_res.get("tool_call_leak", 0), c_res.get("eval", ""), c_res.get("code", ""),
            1 if h_res.get("ok") else 0, h_res.get("score", 0), h_res.get("duration", 0), h_res.get("tokens", 0),
            h_res.get("eval", ""), h_res.get("text", ""),
            1 if r_res.get("ok") else 0, r_res.get("score", 0), r_res.get("duration", 0), r_res.get("tokens", 0),
            r_res.get("eval", ""), r_res.get("text", ""),
            tot
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[WARN] Failed to sync {model_id} to SQLite: {e}")


def run_benchmark(gateway, key, models_meta, concurrency=6):
    results = {}
    init_sqlite_db()
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r") as f:
                results = json.load(f)
        except Exception:
            results = {}

    model_ids = list(models_meta.keys())
    print("=" * 125)
    print(f"BENCHMARK COMPREHENSIVE (TOTAL {len(model_ids)} MODELS)")
    print(f"Gateway: {gateway} | Concurrency: {concurrency}")
    print("Test Suites: 1. Ping | 2. Coding + Tool Call | 3. Horror Story | 4. Logic Puzzle")
    print("=" * 125)

    # Phase 1: Ping Screening
    print("\n>>> PHASE 1: SCREENING LATENSI & KONEKSI")
    def ping_worker(m):
        res = request_chat(gateway, key, m, PROMPT_PING, max_tokens=15, timeout=15)
        return m, res

    active_models = []
    completed = 0
    total = len(model_ids)
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futs = {executor.submit(ping_worker, m): m for m in model_ids}
        for fut in as_completed(futs):
            m, res = fut.result()
            completed += 1
            if m not in results:
                results[m] = {"id": m, "provider": m.split("/")[0]}
            results[m]["ping"] = res
            status_str = "OK 200" if res["ok"] else f"ERR {res['status']}"
            err_preview = (res["error"] or res["text"] or "")[:45].replace("\n", " ")
            print(f"[{completed:3d}/{total:3d}] {status_str:<8} | {res['duration']:5.2f}s | {m:<45} | {err_preview}")
            sync_result_to_sqlite(m, results[m], models_meta[m])
            if res["ok"]:
                active_models.append(m)

    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n[PHASE 1 SELESAI] {len(active_models)}/{len(model_ids)} MODEL AKTIF")

    # Phase 2, 3, 4: Deep Testing
    if not active_models:
        print("[INFO] Tidak ada model yang merespons OK pada provider ini.")
        return results

    print("\n>>> PHASE 2, 3, 4: DEEP CAPABILITY BENCHMARK (CODING + TOOL CALL, HORROR, LOGIC)")
    def deep_worker(m):
        item_res = results.get(m, {"id": m, "provider": m.split("/")[0]})
        meta = models_meta.get(m, {})

        # Coding with tool calls
        c_raw = request_chat(gateway, key, m, PROMPT_CODING, max_tokens=550, timeout=40, tools=EXECUTE_CODE_TOOL)
        c_eval = eval_coding_with_tools(c_raw)
        item_res["coding"] = {
            "ok": c_raw.get("ok", False),
            "score": c_eval["score"],
            "tool_call_status": c_eval["status"],
            "tool_call_leak": c_eval["leak"],
            "duration": c_raw.get("duration", 0),
            "tokens": c_raw.get("tokens", 0),
            "eval": c_eval["eval"],
            "code": c_eval["code"],
            "text": c_raw.get("text", ""),
            "tool_calls": c_raw.get("tool_calls", [])
        }
        time.sleep(0.3)

        # Horror Story
        h_raw = request_chat(gateway, key, m, PROMPT_HORROR, max_tokens=500, timeout=40)
        h_score, h_eval = eval_horror(h_raw.get("text", ""))
        item_res["horror"] = {
            "ok": h_raw.get("ok", False),
            "score": h_score,
            "duration": h_raw.get("duration", 0),
            "tokens": h_raw.get("tokens", 0),
            "eval": h_eval,
            "text": h_raw.get("text", "")
        }
        time.sleep(0.3)

        # Deductive Logic
        r_raw = request_chat(gateway, key, m, PROMPT_REASONING, max_tokens=400, timeout=35)
        r_score, r_eval = eval_reasoning(r_raw.get("text", ""))
        item_res["reasoning"] = {
            "ok": r_raw.get("ok", False),
            "score": r_score,
            "duration": r_raw.get("duration", 0),
            "tokens": r_raw.get("tokens", 0),
            "eval": r_eval,
            "text": r_raw.get("text", "")
        }

        sync_result_to_sqlite(m, item_res, meta)
        return m, item_res

    deep_concurrency = min(concurrency, 5)
    deep_completed = 0
    deep_total = len(active_models)
    with ThreadPoolExecutor(max_workers=deep_concurrency) as executor:
        futs = {executor.submit(deep_worker, m): m for m in active_models}
        for fut in as_completed(futs):
            m, item_res = fut.result()
            deep_completed += 1
            results[m] = item_res
            c = item_res.get("coding", {})
            h = item_res.get("horror", {})
            r = item_res.get("reasoning", {})
            tc_status = c.get("tool_call_status", "UNKNOWN")
            print(f"[{deep_completed:3d}/{deep_total:3d}] DONE | {m:<42} | Code: {c.get('score', 0):3d} [Tool: {tc_status:<16}] | Horror: {h.get('score', 0):3d} | Logic: {r.get('score', 0):3d}")

    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f, indent=2)

    return results


def print_detailed_provider_report(results, models_meta, provider_name):
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
    SELECT * FROM model_benchmarks 
    WHERE provider = ? 
    ORDER BY total_score DESC, ping_duration ASC
    """, (provider_name,))
    rows = c.fetchall()
    conn.close()

    print("\n" + "=" * 135)
    print(f"LAPORAN LENGKAP DETAIL BENCHMARK PROVIDER: {provider_name.upper()} ({len(rows)} Models)")
    print("=" * 135)
    for r in rows:
        m = r["model_id"]
        ctx = f"{r['context_length']:,}" if r['context_length'] else "N/A"
        max_out = f"{r['max_output_tokens']:,}" if r['max_output_tokens'] else "N/A"
        print(f"\nModel: {m}")
        print(f"  - Spek: Context Window: {ctx} tokens | Max Output: {max_out} tokens | Free: {'Ya' if r['is_free'] else 'Tidak'}")
        if not r["ping_ok"]:
            print(f"  - Status: OFFLINE / GAGAL (HTTP {r['ping_status']})")
            print(f"  - Pesan Error: {r['ping_error']}")
            continue

        print(f"  - Ping Latensi: {r['ping_duration']:.2f}s (OK 200)")
        print(f"  - Coding + Tool Call: {r['coding_score']}/100 ({r['coding_duration']:.2f}s, {r['coding_tokens']} tok)")
        print(f"    * Tool Call Status: {r['tool_call_status']} (Bocor: {'YA' if r['tool_call_leak'] else 'TIDAK'})")
        print(f"    * Analisis Code: {r['coding_eval']}")
        print(f"  - Cerita Horor: {r['horror_score']}/100 ({r['horror_duration']:.2f}s, {r['horror_tokens']} tok)")
        print(f"    * Analisis Sastra: {r['horror_eval']}")
        print(f"  - Deductive Logic: {r['reasoning_score']}/100 ({r['reasoning_duration']:.2f}s, {r['reasoning_tokens']} tok)")
        print(f"    * Analisis Logika: {r['reasoning_eval']}")
        print(f"  - TOTAL SKOR: {r['total_score']}/300")
        print("-" * 135)


PROVIDER_ALIASES = {
    "kc": "kc", "kilocode": "kc",
    "kcf": "kcf", "kilocode-free": "kcf",
    "ag": "ag", "antigravity": "ag",
    "uk": "uk", "unikey": "uk",
    "oc": "oc", "opencode": "oc",
    "ocz": "ocz", "opencode-zen": "ocz",
    "cf": "cf", "cloudflare": "cf", "cloudflare-ai": "cf",
    "cx": "cx", "codex": "cx",
    "gh": "gh", "github": "gh",
    "wb": "wb", "workbuddy": "wb",
    "th": "th", "tokenharbor": "th",
    "orca": "orca", "orcarouter": "orca",
    "mrp": "mrp", "morphllm": "mrp",
    "qd": "qd", "qoder": "qd",
    "cbai": "cbai", "codebuddy-intl": "cbai",
    "cbcn": "cbcn", "codebuddy-cn": "cbcn",
    "bx": "bai", "bai": "bai",
    "nx": "nx", "nvidia": "nx",
    "mm": "mm", "minimax": "mm",
    "gc": "gc", "grok-cli": "gc",
    "tr": "tr", "tokenrouter": "tr",
    "or": "or", "openrouter": "or",
    "cline-free": "cline-free",
}

def main():
    parser = argparse.ArgumentParser(description="AxonRouter Comprehensive Benchmark CLI")
    parser.add_argument("--gateway", default=DEFAULT_GATEWAY, help="AxonRouter gateway URL")
    parser.add_argument("--key", default=DEFAULT_KEY, help="AxonRouter API Key")
    parser.add_argument("--concurrency", type=int, default=5, help="Concurrent workers")
    parser.add_argument("--provider", type=str, required=True, help="Provider name or prefix to test")
    parser.add_argument("--clean", action="store_true", help="Clean database records for this provider before running")
    args = parser.parse_args()

    init_sqlite_db()
    if args.clean:
        conn = sqlite3.connect(SQLITE_DB)
        c = conn.cursor()
        c.execute("DELETE FROM model_benchmarks WHERE provider = ?", (args.provider.lower().strip(),))
        conn.commit()
        conn.close()
        print(f"[INFO] Cleared previous records for provider '{args.provider}'.")

    raw_prov = args.provider.lower().strip()
    prov = PROVIDER_ALIASES.get(raw_prov, raw_prov)
    
    models_meta = fetch_available_models_meta(args.gateway, args.key)
    filtered_meta = {
        k: v for k, v in models_meta.items()
        if k.lower().startswith(prov + "/") or k.lower().split("/")[0] == prov
    }

    # Cari model yang belum terdaftar di axonrouter (dari upstream langsung)
    if prov == "kc":
        try:
            req = urllib.request.Request(
                "https://api.kilo.ai/api/gateway/models",
                headers={"Accept": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                upstream_raw = json.loads(resp.read().decode("utf-8"))
                upstream_list = upstream_raw.get("data", []) if isinstance(upstream_raw, dict) else upstream_raw
                upstream_models = []
                for item in upstream_list:
                    mid = item.get("id", "")
                    pricing = item.get("pricing", {})
                    is_free = item.get("isFree", False) or ":free" in mid or (str(pricing.get("prompt")) == "0" and str(pricing.get("completion")) == "0")
                    ctx = item.get("context_length") or item.get("top_provider", {}).get("context_length", 0) or 0
                    max_out = item.get("top_provider", {}).get("max_completion_tokens", 0) or 0
                    if mid and (is_free or ":free" in mid):
                        upstream_models.append({
                            "id": mid,
                            "context_length": ctx,
                            "max_output_tokens": max_out,
                            "is_free": is_free,
                            "name": item.get("name", mid),
                            "upstream_provider": item.get("provider", "unknown"),
                        })
                existing = set(filtered_meta.keys())
                missing = [u for u in upstream_models if f"kc/{u['id']}" not in existing and u["id"] not in existing]
                if missing:
                    print(f"\n[INFO] Ditemukan {len(missing)} model Kilo Code yang BELUM terdaftar di axonrouter:")
                    for u in missing:
                        flag = "[FREE]" if u["is_free"] else "[PAID]"
                        print(f"  - {flag} {u['id']} (ctx={u['context_length']:,}, max_out={u['max_output_tokens']:,}, upstream={u['upstream_provider']})")
                    
                    # Tambahkan missing models ke filtered_meta dengan prefix kc/
                    for u in missing:
                        full_id = f"kc/{u['id']}" if not u['id'].startswith('kc/') else u['id']
                        if full_id not in filtered_meta:
                            filtered_meta[full_id] = {
                                "id": full_id,
                                "provider": "kc",
                                "base_model": u['id'],
                                "context_length": u["context_length"],
                                "max_output_tokens": u["max_output_tokens"],
                                "capabilities": {},
                                "_upstream_only": True,
                                "_upstream_name": u["name"],
                                "_upstream_free": u["is_free"],
                                "_upstream_provider": u["upstream_provider"],
                            }
                    print(f"\n[INFO] Total model yang akan diuji: {len(filtered_meta)} (termasuk {len(missing)} model baru dari upstream)")
        except Exception as e:
            print(f"[WARN] Gagal fetch upstream kilo.ai: {e}")

    if not filtered_meta:
        print(f"[ERROR] Tidak ada model untuk provider '{args.provider}' di gateway.", file=sys.stderr)
        sys.exit(1)

    print(f"\nDitemukan {len(filtered_meta)} model untuk provider '{args.provider}' ({prov}).")
    results = run_benchmark(args.gateway, args.key, filtered_meta, concurrency=args.concurrency)
    print_detailed_provider_report(results, filtered_meta, prov)


if __name__ == "__main__":
    main()
