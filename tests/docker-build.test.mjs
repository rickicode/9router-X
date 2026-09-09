// Run: node --test tests/docker-build.test.mjs
// Static cache/runtime contract; actual image checks still require Docker.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const runtime = dockerfile.split('AS runtime-deps\n')[1]?.split('FROM runtime-deps AS runner')[0];
const runner = dockerfile.split('FROM runtime-deps AS runner')[1];

test('runtime installers stay independent of app source and build output', () => {
  assert.ok(runtime, 'runtime-deps stage exists');
  assert.doesNotMatch(runtime, /^COPY|--from=builder/m);
  assert.equal((runtime.match(/^RUN /gm) || []).length, 3, 'separate utility, Tailscale, and Devin cache layers');
  assert.match(runtime, /gosu curl tar ca-certificates iptables/);
  assert.match(runtime, /install -y --no-install-recommends tailscale/);
  assert.match(runtime, /\/usr\/local\/bin\/devin/);
  assert.doesNotMatch(runner, /apt-get|https:\/\/static\.devin\.ai|https:\/\/pkgs\.tailscale\.com/);
});

test('Devin manifest parsing fails closed instead of hiding pipeline errors', () => {
  assert.match(runtime, /JSON\.parse/);
  assert.match(runtime, /m\.platforms\?\.\["x86_64-unknown-linux"\]\?\.url/);
  assert.match(runtime, /if \(!url\) throw new Error/);
  assert.match(runtime, /--retry 3 --connect-timeout 30 --max-time 300/);
  assert.doesNotMatch(runtime, /\|\s*(grep|xargs|tar)/);
});

test('runtime entrypoint, health check, traced dependencies and npm cache remain', () => {
  for (const path of ['public', '.next/static', '.next/standalone', 'custom-server.js', 'open-sse', 'src/mitm', 'node_modules/node-forge', 'node_modules/next', 'node_modules/node-machine-id']) {
    assert.ok(runner.includes(`COPY --from=builder /app/${path} `), path);
  }
  assert.match(runner, /ENTRYPOINT \["\/entrypoint\.sh"\]/);
  assert.match(runner, /EXPOSE 10128/);
  assert.match(runner, /127\.0\.0\.1:10128\/api\/health/);
  assert.match(runner, /CMD \["node", "--max-old-space-size=1536", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "custom-server\.js"\]/);
  assert.match(dockerfile, /--mount=type=cache,target=\/root\/\.npm/);
});
