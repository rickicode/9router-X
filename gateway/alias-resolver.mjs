// Runtime "@"-alias resolver for the gateway (mirrors tsconfig paths:
//   "@/*" -> "src/*", plus "open-sse" already resolves by relative path).
// Loaded via node --import before anything else. Keeps gateway ESM imports
// working without a bundler step.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(projectRoot, "src", specifier.slice(2));
    const candidates = [
      target,
      `${target}.js`,
      `${target}.mjs`,
      path.join(target, "index.js"),
      path.join(target, "index.mjs"),
    ];
    for (const c of candidates) {
      if (existsSync(c) && !c.endsWith("/")) {
        return { url: pathToFileURL(c).href, shortCircuit: true };
      }
    }
  }
  // Directory-style imports like "@/lib/localDb" resolve to index.js — handled
  // above. "open-sse/..." specifiers are plain relative paths inside the repo
  // and resolve natively; nothing to do.
  return nextResolve(specifier, context);
}
