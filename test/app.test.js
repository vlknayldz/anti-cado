"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");

test("app modülü içe aktarılınca uygulamayı başlatmaz ve startAutomation dışa verir", () => {
  const script = [
    "const app = require('./src/app');",
    "if (typeof app.startAutomation !== 'function') {",
    "  throw new Error('startAutomation dışa verilmedi');",
    "}",
    "process.exit(0);",
  ].join("\n");
  execFileSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    timeout: 10000,
    stdio: "pipe",
  });
});

test("startAutomation dışarıdan verilen panel denetleyicisiyle çalışır ve stop_all ile kapanır", async () => {
  // Güvenlik ağı: regresyon olursa gerçek Chrome yerine zararsız bir exe denenir.
  process.env.IG_GRUP_CHROME_PATH = path.join(
    process.env.SystemRoot || "C:/Windows",
    "System32",
    "where.exe",
  );
  const { EventEmitter } = require("node:events");
  const { startAutomation } = require("../src/app");

  const active = new Set();
  const calls = [];
  const controller = new EventEmitter();
  controller.startRules = async (rules) => {
    calls.push(["start", rules.map((rule) => rule.id)]);
    rules.forEach((rule) => active.add(rule.id));
    return rules.map((rule) => ({ rule, ok: true }));
  };
  controller.stopRules = (rules) => calls.push(["stop", rules.map((rule) => rule.id)]);
  controller.stopAll = async () => {
    calls.push(["stopAll"]);
    active.clear();
  };
  controller.status = () => ({ activeRuleIds: new Set(active) });

  const prompts = {
    async waitForAutomationCommand() {
      return "stop_all";
    },
    async confirm() {
      return true;
    },
  };

  const rule = {
    id: "r1",
    enabled: true,
    platform: "instagram",
    conversationType: "direct",
    conversationName: "Sohbet",
    senderUsername: "hedef",
  };

  await startAutomation({ rules: [rule] }, prompts, [rule], { controller });

  assert.deepEqual(calls, [["start", ["r1"]], ["stopAll"]]);
});
