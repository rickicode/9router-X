import urllib.request
import json
import time
import sys

URL = "http://192.168.90.101:10128/v1/chat/completions"
KEY = "sk-1913e25d85487647-bkjq1z-e0b63207"

PROMPT_CODING = """Implementasikan sistem TokenBucketRateLimiter di Python yang thread-safe menggunakan threading.Lock.
Spesifikasi:
1. Class `TokenBucketRateLimiter(capacity: int, refill_rate: float)` (refill_rate = token per detik).
2. Method `consume(tokens: int = 1) -> bool` yang mengembalikan True jika token cukup dan mengurangi token, False jika tidak.
3. Method `time_until_next_available(tokens: int = 1) -> float` menghitung waktu tunggu dalam detik.
4. Sertakan penanganan refill berbasis timestamp (lazy refill) tanpa background thread terpisah.
5. Tuliskan kode lengkap yang siap pakai dengan typing dan contoh pemanggilan."""

PROMPT_COPYWRITE = """Buatkan copywriter landing page persuasif dalam Bahasa Indonesia untuk produk SaaS B2B bernama "CloudScale":
1. Target audiens: CTO dan Engineering Lead startup tech.
2. Hook/Headline yang provokatif dan menohok tentang pemborosan cloud bill AWS/GCP.
3. Subheadline yang menjelaskan value proposition (otomasi rightsizing infra & hemat hingga 60%).
4. 3 Bullet point manfaat utama dengan pendekatan storytelling singkat.
5. Call to Action (CTA) dengan FOMO dan jaminan no-risk.
Gunakan gaya bahasa profesional, tajam, persuasif, tanpa basa-basi klise."""

MODELS = [
    # Top coding & frontier models
    {"id": "kilocode/kilo-auto/free", "name": "Kilo Auto Free (Router)", "ctx": 256000, "max_out": 10000},
    {"id": "kilocode/poolside/laguna-xs-2.1:free", "name": "Poolside Laguna XS 2.1", "ctx": 262144, "max_out": 32768},
    {"id": "kilocode/poolside/laguna-s-2.1:free", "name": "Poolside Laguna S 2.1", "ctx": 262144, "max_out": 32768},
    {"id": "kilocode/cohere/north-mini-code:free", "name": "Cohere North Mini Code", "ctx": 256000, "max_out": 64000},
    {"id": "kilocode/nex-agi/nex-n2.5-mini:free", "name": "Nex AGI N2.5 Mini", "ctx": 262144, "max_out": 235929},
    {"id": "kilocode/nex-agi/nex-n2.5-pro:free", "name": "Nex AGI N2.5 Pro", "ctx": 262144, "max_out": 235929},
    {"id": "kilocode/nvidia/nemotron-3-ultra-550b-a55b:free", "name": "NVIDIA Nemotron 3 Ultra 550B", "ctx": 1000000, "max_out": 65536},
    {"id": "kilocode/nvidia/nemotron-3.5-lightning:free", "name": "NVIDIA Nemotron 3.5 Lightning", "ctx": 1000000, "max_out": 65536},
    {"id": "kilocode/inclusionai/ling-3.0-flash-vl:free", "name": "InclusionAI Ling 3.0 Flash VL", "ctx": 262144, "max_out": 32768},
    {"id": "kilocode/inclusionai/ling-3.0-flash-fin:free", "name": "InclusionAI Ling 3.0 Flash Fin", "ctx": 262144, "max_out": 32768},
    {"id": "kilocode/inclusionai/ling-3.0-flash-sante:free", "name": "InclusionAI Ling 3.0 Flash Sante", "ctx": 262144, "max_out": 32768},
    {"id": "kilocode/dots-studio/dots-3-note-preview:free", "name": "Dots Studio Dots 3 Note", "ctx": 512000, "max_out": 460800},
    {"id": "kilocode/stepfun/step-3.7-flash:free", "name": "StepFun Step 3.7 Flash", "ctx": 262144, "max_out": 262144},
    {"id": "kilocode/z-ai/glm-5.2:free", "name": "Z.ai GLM 5.2 Free", "ctx": 32768, "max_out": 29491},
    {"id": "kilocode/qwen/qwen3.8-27b:free", "name": "Qwen Qwen3.8 27B", "ctx": 262144, "max_out": 235929},
    {"id": "kilocode/thinkingmachines/inkling-small:free", "name": "Thinking Machines Inkling Small", "ctx": 1048576, "max_out": 262144},
    {"id": "kilocode/openrouter/free", "name": "OpenRouter Free (Router)", "ctx": 200000, "max_out": 8192},
]

def query_model(model_id, prompt, max_tokens=550):
    payload = json.dumps({
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "stream": False
    }).encode("utf-8")

    req = urllib.request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json"
    })

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            dur = time.time() - t0
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            msg = data.get("choices", [{}])[0].get("message", {})
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning") or ""
            text = (content or reasoning).strip()
            tokens = data.get("usage", {}).get("completion_tokens", len(text.split()))
            return True, dur, tokens, text, None
    except Exception as e:
        dur = time.time() - t0
        err_msg = str(e)
        if hasattr(e, "read"):
            try:
                b = json.loads(e.read().decode("utf-8"))
                err_msg = b.get("error", {}).get("message", err_msg)
            except:
                pass
        return False, dur, 0, "", err_msg

def run_suite(suite_name, prompt, max_tokens=550):
    print("\n" + "=" * 130)
    print(f"BENCHMARK: {suite_name.upper()}")
    print("=" * 130)
    print(f"{'Status':<8} | {'Latensi':<7} | {'Model ID':<50} | {'Context':<8} | {'Max Out':<8} | {'Tokens':<7} | {'Cuplikan Hasil / Error'}")
    print("-" * 130)

    results = []
    for m in MODELS:
        ok, dur, tokens, text, err = query_model(m["id"], prompt, max_tokens)
        status = "OK 200" if ok else "ERROR"
        info = text[:55].replace("\n", " ") if ok else (err[:50] if err else "Error")
        ctx_k = f"{m['ctx']//1000}k"
        max_k = f"{m['max_out']//1000}k" if m['max_out'] else "-"
        print(f"{status:<8} | {dur:5.2f}s | {m['id']:<50} | {ctx_str(m['ctx']):<8} | {ctx_str(m['max_out']):<8} | {tokens:<7} | {info}")
        results.append({
            "id": m["id"],
            "ctx": m["ctx"],
            "max_out": m["max_out"],
            "ok": ok,
            "dur": dur,
            "tokens": tokens,
            "text": text,
            "err": err
        })
        time.sleep(1.2)
    return results

def ctx_str(val):
    if not val: return "-"
    if val >= 1000000: return f"{val/1000000:.1f}M"
    return f"{val//1000}k"

def main():
    print("MEMULAI BENCHMARK GANDA MODEL FREE KILO CODE")
    print(f"1. Coding Semi-Berat: Token Bucket Rate Limiter (Thread-safe, O(1), Lazy Refill, Typing)")
    print(f"2. Copywriting B2B: Landing Page SaaS CloudScale (Persuasif, Bahasa Indonesia, Storytelling)")

    # 1. Coding Semi-Berat
    coding_res = run_suite("Coding Semi-Berat: Token Bucket Rate Limiter", PROMPT_CODING, max_tokens=550)

    # 2. Copywriting Bahasa Indonesia
    copy_res = run_suite("Copywriting B2B: Landing Page CloudScale", PROMPT_COPYWRITE, max_tokens=500)

    # Summary
    print("\n" + "=" * 130)
    print("REKAP AKHIR: MODEL TERBAIK UNTUK CODING DAN COPYWRITING DI KILO CODE")
    print("=" * 130)

    print("\n[ TOP 5 CODING SEMI-BERAT (Kecepatan + Validitas Arsitektur Kode) ]")
    valid_coding = [r for r in coding_res if r["ok"] and any(k in r["text"] for k in ["TokenBucketRateLimiter", "consume", "Lock"])]
    valid_coding.sort(key=lambda x: x["dur"])
    for idx, r in enumerate(valid_coding[:5], 1):
        print(f"#{idx} | {r['dur']:5.2f}s | {r['id']:<48} | Ctx: {ctx_str(r['ctx']):<6} | MaxOut: {ctx_str(r['max_out']):<6} | {r['tokens']} tok")

    print("\n[ TOP 5 COPYWRITING BAHASA INDONESIA (Kecepatan + Gaya Bahasa Persuasif) ]")
    valid_copy = [r for r in copy_res if r["ok"] and len(r["text"]) > 100]
    valid_copy.sort(key=lambda x: x["dur"])
    for idx, r in enumerate(valid_copy[:5], 1):
        print(f"#{idx} | {r['dur']:5.2f}s | {r['id']:<48} | Ctx: {ctx_str(r['ctx']):<6} | MaxOut: {ctx_str(r['max_out']):<6} | {r['tokens']} tok")

if __name__ == "__main__":
    main()
