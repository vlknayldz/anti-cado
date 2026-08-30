"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { AutomationController } = require("../src/automation-controller");

class FakeSession {
  constructor() {
    this.added = [];
    this.activated = [];
    this.canceled = [];
    this.closed = 0;
  }

  async addRules(rules) {
    this.added.push(...rules.map((rule) => rule.id));
  }

  activateRule(ruleId) {
    this.activated.push(ruleId);
  }

  cancelRule(ruleId) {
    this.canceled.push(ruleId);
  }

  startPolling(handler) {
    this.pollingHandler = handler;
  }

  queueSend() {}

  async close() {
    this.closed += 1;
  }
}

class FakeRunner {
  constructor() {
    this.reset = [];
    this.stopped = [];
    this.allStopped = 0;
  }

  resetRule(ruleId) {
    this.reset.push(ruleId);
  }

  stopRule(ruleId) {
    this.stopped.push(ruleId);
  }

  stopAll() {
    this.allStopped += 1;
  }

  handle() {}
}

function rule(id) {
  return { id, enabled: true, conversationName: `Sohbet ${id}`, senderUsername: id };
}

test("panel denetleyicisi kuralları sonradan başlatıp ayrı ayrı durdurur", async () => {
  const controller = new AutomationController("profile", {
    SessionClass: FakeSession,
    RunnerClass: FakeRunner,
  });
  const first = rule("bir");
  const second = rule("iki");

  await controller.startRules([first]);
  const session = controller.session;
  const runner = controller.runner;
  await controller.startRules([second]);

  assert.deepEqual(session.added, ["bir", "iki"]);
  assert.deepEqual(session.activated, ["bir", "iki"]);
  assert.equal(controller.polling, true);
  assert.deepEqual([...controller.status().activeRuleIds], ["bir", "iki"]);

  controller.stopRules([first]);
  assert.deepEqual(runner.stopped, ["bir"]);
  assert.deepEqual(session.canceled, ["bir"]);
  assert.deepEqual([...controller.status().activeRuleIds], ["iki"]);

  await controller.stopAll();
  assert.equal(session.closed, 1);
  assert.equal(runner.allStopped, 1);
  assert.equal(controller.status().activeRuleIds.size, 0);
});

test("kapalı kuralı başlatmaz", async () => {
  const controller = new AutomationController("profile", {
    SessionClass: FakeSession,
    RunnerClass: FakeRunner,
  });
  const disabled = { ...rule("kapalı"), enabled: false };
  assert.deepEqual(await controller.startRules([disabled]), []);
  assert.equal(controller.status().activeRuleIds.size, 0);
  assert.equal(controller.polling, false);
});
