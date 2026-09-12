export function parseJson(str, fallback = null) {
  if (str == null) return fallback;
  if (typeof str !== "string") return str;
  try {
    let parsed = JSON.parse(str);
    if (typeof parsed === "string" && (parsed.startsWith("{") || parsed.startsWith("["))) {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}
