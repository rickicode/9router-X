// Guards the reverse-engineered OpenCode CLI identity (2026-09-17): the
// keyless free-tier gate rejects bare "opencode" UAs and non-conforming
// ses_/msg_ ids with 403 FreeTierError. No network access in this file.
import { describe, it, expect } from "vitest";
import { OpenCodeExecutor, OPENCODE_SESSION_RE, OPENCODE_REQUEST_RE } from "../../open-sse/executors/opencode.js";

const creds = (rawHeaders = {}) => ({ connectionId: "noauth", rawHeaders });

describe("opencode client identity masquerade", () => {
  it("synthesizes a versioned UA by default", () => {
    const h = new OpenCodeExecutor().buildHeaders(creds(), false);
    expect(h["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
  });

  it("mints conforming session/request ids (20 samples)", () => {
    const ex = new OpenCodeExecutor();
    for (let i = 0; i < 20; i++) {
      ex.transformRequest("mimo-v2.5-free", { messages: [] }, false, creds());
      const h = ex.buildHeaders(creds(), false);
      expect(h["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
      expect(h["x-opencode-request"]).toMatch(OPENCODE_REQUEST_RE);
    }
  });

  it("forwards a genuine downstream CLI UA, replaces a bare one", () => {
    const ex = new OpenCodeExecutor();
    const genuine = "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14";
    expect(ex.buildHeaders(creds({ "user-agent": genuine }), false)["User-Agent"]).toBe(genuine);
    expect(ex.buildHeaders(creds({ "user-agent": "opencode" }), false)["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
    expect(ex.buildHeaders(creds({ "user-agent": "curl/8.5.0" }), false)["User-Agent"]).toMatch(/^opencode\/\d+\.\d+/i);
  });

  it("replaces non-conforming downstream ids, keeps conforming ones", () => {
    const ex = new OpenCodeExecutor();
    const bad = ex.buildHeaders(creds({ "x-opencode-session": "ses_abcdef", "x-opencode-request": "zzz" }), false);
    expect(bad["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
    expect(bad["x-opencode-request"]).toMatch(OPENCODE_REQUEST_RE);
    const goodSes = "ses_88eace740ba32HQP4N6FgPkrtV";
    const goodReq = "msg_23a32080a7e8JFnCIPWivI4GFQ";
    const good = ex.buildHeaders(creds({ "x-opencode-session": goodSes, "x-opencode-request": goodReq }), false);
    expect(good["x-opencode-session"]).toBe(goodSes);
    expect(good["x-opencode-request"]).toBe(goodReq);
  });
});
