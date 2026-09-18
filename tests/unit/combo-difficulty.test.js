/**
 * handleDifficultyChat: judge picks a tier (easy/medium/hard), then ONLY that
 * tier runs sequentially with escalation easy→medium→hard. Session-cache +
 * context lock (Morph router pattern) so ambiguous turns are judged once and
 * expensive contexts pin the route.
 */
import { describe, it, expect, vi } from "vitest";
import { handleDifficultyChat } from "../../open-sse/services/combo.js";

function judgeRes(judgeContent) {
  const envelope = JSON.stringify({ choices: [{ message: { content: judgeContent } }] });
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => JSON.parse(envelope), text: async () => envelope }; },
    json: async () => JSON.parse(envelope),
    text: async () => envelope,
  };
}

function okRes(text = "hello") {
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    clone() { return { json: async () => ({ choices: [{ message: { content: text } }] }), text: async () => text }; },
    json: async () => ({ choices: [{ message: { content: text } }] }),
    text: async () => text,
  };
}

function errRes(status = 500) {
  return { ok: false, status, headers: new Map() };
}

const quietLog = { info: () => {}, warn: () => {}, error: () => {} };

describe("handleDifficultyChat (smart routing)", () => {
  it("obvious-easy body runs the easy tier without calling the judge", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("pong");
    });
    const body = { messages: [{ role: "user", content: "halo" }], stream: false };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-a"]); // judge never called
  });

  it("obvious-hard body (tool history) runs the hard tier", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      return okRes("pong");
    });
    const body = {
      messages: [
        { role: "user", content: "do things" },
        { role: "assistant", tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "1", content: "done" },
        { role: "user", content: "now another" },
      ],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["hard-a"]);
  });

  it("ambiguous body asks the judge, then runs the judged tier", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") return judgeRes('{"difficulty":"medium","ambiguity":"low"}');
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Help me refactor this API endpoint handler to add pagination." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls[0]).toBe("judge-model"); // judge called first
    expect(calls).toContain("med-a");     // medium tier runs
    expect(calls).not.toContain("easy-a");
    expect(calls).not.toContain("hard-a");
  });

  it("escalates easy→medium→hard on consecutive tier failure", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "easy-a") return errRes(500);
      if (m === "med-a") return errRes(500);
      return okRes("pong");
    });
    const body = { messages: [{ role: "user", content: "hi" }], stream: false };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "med-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      tuning: { easyModels: ["easy-a"], mediumModels: ["med-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["easy-a", "med-a", "hard-a"]);
  });

  it("fails open to hard tier when judge is unusable", async () => {
    const calls = [];
    const handleSingleModel = vi.fn(async (b, m) => {
      calls.push(m);
      if (m === "judge-model") throw new Error("judge down");
      return okRes("pong");
    });
    const body = {
      messages: [{ role: "user", content: "Help me refactor this API endpoint handler with retries." }],
      stream: false,
    };
    const res = await handleDifficultyChat({
      body,
      models: ["easy-a", "hard-a"],
      handleSingleModel,
      log: quietLog,
      comboName: "smart-model",
      judgeModel: "judge-model",
      tuning: { easyModels: ["easy-a"], hardModels: ["hard-a"] },
    });
    expect(res.ok).toBe(true);
    expect(calls).toContain("hard-a");
  });
});
