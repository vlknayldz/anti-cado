"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { runDashboard } = require("../src/tui");

test("fare tıklaması kuralı tek tıkta seçer", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const output = new PassThrough();
  output.isTTY = true;
  output.columns = 100;
  output.rows = 30;

  class FakeController extends EventEmitter {
    status() {
      return { activeRuleIds: new Set() };
    }

    async stopAll() {}
  }

  const store = {
    profileDirectory: "profile",
    async load() {
      return {
        rules: [
          {
            id: "fare-kurali",
            enabled: true,
            platform: "instagram",
            conversationType: "direct",
            conversationName: "Fare Testi",
            senderUsername: "hedef",
            contentType: "text",
            copiesPerTrigger: 1,
          },
        ],
      };
    },
  };

  await runDashboard(store, {
    controller: new FakeController(),
    input,
    output,
    onReady({ close, rulesList, statusBox }) {
      rulesList.items[0].emit("click", { action: "mouseup", button: "left" });
      assert.match(statusBox.getContent(), /1 seçili/);
      close();
    },
  });
});

test("TERM tanımsızken bile fare bildirimi xterm protokolüyle açılır", async () => {
  const savedTerm = process.env.TERM;
  delete process.env.TERM;
  try {
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};
    const output = new PassThrough();
    output.isTTY = true;
    output.columns = 100;
    output.rows = 30;
    let written = "";
    output.on("data", (chunk) => {
      written += chunk.toString("latin1");
    });

    class FakeController extends EventEmitter {
      status() {
        return { activeRuleIds: new Set() };
      }

      async stopAll() {}
    }

    const store = {
      profileDirectory: "profile",
      async load() {
        return { rules: [] };
      },
    };

    await runDashboard(store, {
      controller: new FakeController(),
      input,
      output,
      onReady({ close }) {
        close();
      },
    });

    const mouseOn = String.fromCharCode(27) + "[?1000h";
    assert.ok(
      written.includes(mouseOn),
      "fare bildirimi dizisi (CSI ?1000h) terminale gönderilmedi",
    );
  } finally {
    if (savedTerm !== undefined) process.env.TERM = savedTerm;
  }
});
