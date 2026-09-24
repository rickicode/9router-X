#!/usr/bin/env node
/**
 * Internal CLI tool for AxonRouter agents.
 * Checks upstream `decolua/9router` releases, npm registry, and commits.
 * Updates `.agent/upstream-comparison.json` with new findings.
 *
 * Usage: node .agent/scripts/check-upstream.mjs [--save]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = resolve(__dirname, "../upstream-comparison.json");
const PKG_PATH = resolve(__dirname, "../../package.json");

const shouldSave = process.argv.includes("--save");

async function main() {
  const memory = JSON.parse(readFileSync(MEMORY_PATH, "utf8"));
  const localPkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));

  console.log(`\n=================================================`);
  console.log(`AxonRouter Upstream Comparator`);
  console.log(`Local Version : v${localPkg.version} (${memory.axonrouter.codename})`);
  console.log(`Fork Baseline : v${memory.axonrouter.upstreamForkBaseline}`);
  console.log(`Upstream Repo : ${memory.upstream.repository}`);
  console.log(`=================================================\n`);

  // 1. Fetch npm version
  let npmVersion = null;
  try {
    const res = await fetch("https://registry.npmjs.org/9router/latest", {
      headers: { "User-Agent": "AxonRouter-Internal-Agent" },
    });
    if (res.ok) {
      const data = await res.json();
      npmVersion = data.version;
    }
  } catch (err) {
    console.warn(`[!] Failed to query npm: ${err.message}`);
  }

  // 2. Fetch latest commits from upstream
  let latestCommits = [];
  try {
    const res = await fetch("https://api.github.com/repos/decolua/9router/commits?per_page=10", {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AxonRouter-Internal-Agent",
      },
    });
    if (res.ok) {
      latestCommits = await res.json();
    }
  } catch (err) {
    console.warn(`[!] Failed to query GitHub commits: ${err.message}`);
  }

  console.log(`[Status]`);
  console.log(`- Latest upstream npm package : v${npmVersion || "unknown"}`);
  if (latestCommits.length > 0) {
    const head = latestCommits[0];
    console.log(`- Latest upstream commit      : ${head.sha.slice(0, 8)} (${head.commit.committer.date})`);
    console.log(`  Message: ${head.commit.message.split("\n")[0]}`);
  }

  console.log(`\n[Recent Upstream Commits]`);
  for (const c of latestCommits.slice(0, 6)) {
    const date = c.commit.committer.date.slice(0, 10);
    const title = c.commit.message.split("\n")[0];
    console.log(`  • ${c.sha.slice(0, 8)} [${date}] ${title}`);
  }

  // 3. Update memory ledger if --save
  if (shouldSave && npmVersion) {
    memory.upstream.latestTrackedVersion = npmVersion;
    if (latestCommits.length > 0) {
      memory.upstream.latestTrackedCommit = latestCommits[0].sha.slice(0, 8);
    }
    memory.upstream.lastCheckedAt = new Date().toISOString();
    writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2) + "\n", "utf8");
    console.log(`\n[✓] Updated memory saved to .agent/upstream-comparison.json`);
  } else if (!shouldSave) {
    console.log(`\n(Pass --save to write updated timestamps/commits to .agent/upstream-comparison.json)`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
