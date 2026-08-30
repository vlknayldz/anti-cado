"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RuleRunner } = require("../src/rule-runner");
const { REPEAT_MODES } = require("../src/rules");

test("her yeni kaynak mesajı yalnızca bir kez işler", async () => {
  const calls = [];
  const runner = new RuleRunner(async (_rule, event) => calls.push(event.marker));
  const rule = {
    id: "rule-1",
    enabled: true,
    repeatMode: REPEAT_MODES.COUNT,
    repeatCount: 3,
  };
  runner.handle(rule, { marker: "message-1" });
  runner.handle(rule, { marker: "message-1" });
  runner.handle(rule, { marker: "message-2" });
  runner.handle(rule, { marker: "message-3" });
  runner.handle(rule, { marker: "message-4" });
  await runner.states.get(rule.id).queue;
  assert.deepEqual(calls, ["message-1", "message-2", "message-3"]);
});

test("sınırsız seçim kendi kendine dönmez ve her yeni mesajda bir kez çalışır", async () => {
  const calls = [];
  const runner = new RuleRunner(async (_rule, event) => calls.push(event.marker));
  const rule = {
    id: "rule-2",
    enabled: true,
    repeatMode: REPEAT_MODES.UNTIL_STOPPED,
  };

  runner.handle(rule, { marker: "old-message" });
  await runner.states.get(rule.id).queue;
  assert.deepEqual(calls, ["old-message"]);

  runner.handle(rule, { marker: "new-message" });
  await runner.states.get(rule.id).queue;
  assert.deepEqual(calls, ["old-message", "new-message"]);
});

test("durdurulan kural sonradan yeniden başlatılabilir", async () => {
  const calls = [];
  const runner = new RuleRunner(async (_rule, event) => calls.push(event.marker));
  const rule = {
    id: "rule-restart",
    enabled: true,
    repeatMode: REPEAT_MODES.UNTIL_STOPPED,
  };

  runner.handle(rule, { marker: "message-1" });
  await runner.states.get(rule.id).queue;
  runner.stopRule(rule.id);
  runner.resetRule(rule.id);
  runner.handle(rule, { marker: "message-2" });
  await runner.states.get(rule.id).queue;

  assert.deepEqual(calls, ["message-1", "message-2"]);
});

test("başarısız gönderim kuralın mesaj kotasını tüketmez", async () => {
  const calls = [];
  let shouldFail = true;
  const runner = new RuleRunner(
    async (_rule, event) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("gönderim hatası");
      }
      calls.push(event.marker);
    },
    { log: () => {} },
  );
  const rule = {
    id: "rule-fail",
    enabled: true,
    repeatMode: REPEAT_MODES.COUNT,
    repeatCount: 1,
  };

  runner.handle(rule, { marker: "message-1" });
  await runner.states.get(rule.id).queue;
  runner.handle(rule, { marker: "message-2" });
  await runner.states.get(rule.id).queue;

  assert.deepEqual(calls, ["message-2"]);
});

test("başarısız gönderim aynı kaynak mesajı yeniden denemez", async () => {
  const attempts = [];
  const runner = new RuleRunner(
    async (_rule, event) => {
      attempts.push(event.marker);
      throw new Error("gönderim hatası");
    },
    { log: () => {} },
  );
  const rule = {
    id: "rule-no-retry",
    enabled: true,
    repeatMode: REPEAT_MODES.UNTIL_STOPPED,
  };

  runner.handle(rule, { marker: "message-1" });
  await runner.states.get(rule.id).queue;
  runner.handle(rule, { marker: "message-1" });
  await runner.states.get(rule.id).queue;

  assert.deepEqual(attempts, ["message-1"]);
});
