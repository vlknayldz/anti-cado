"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  logoDimensions,
  renderCliEmblem,
  runDashboard,
} = require("../src/tui");

test("küçük Fenerbahçe amblemini doğrudan CLI renkleriyle çizer", () => {
  const emblem = renderCliEmblem();
  const lines = emblem.split("\n");
  assert.equal(lines.length, 8);
  assert.ok(lines.every((line) => line.includes("▀")));
  assert.match(emblem, /yellow-(fg|bg)/);
  assert.match(emblem, /blue-(fg|bg)/);
  assert.match(emblem, /white-(fg|bg)/);
  assert.match(emblem, /red-(fg|bg)/);
  assert.match(emblem, /green-(fg|bg)/);
  assert.doesNotMatch(emblem, /\u001bP/);
});

test("CLI amblemi küçük ve sabit boyutta kalır", () => {
  const compact = logoDimensions(80, 24);
  const wide = logoDimensions(120, 30);
  assert.deepEqual(compact, wide);
  assert.deepEqual([compact.boxWidth, compact.boxHeight], [20, 11]);
});


test("amblem kırmızı zemin üzerinde sarı-lacivert kalbi taşır", () => {
  const lines = renderCliEmblem().split(String.fromCharCode(10));
  const heartLine = lines[Math.floor(lines.length / 2)];
  const colors = [...heartLine.matchAll(/([a-z]+)-(fg|bg)/g)].map((m) => m[1]);
  const afterIndex = (color, from) => colors.indexOf(color, from);
  const red1 = afterIndex("red", 0);
  const yellow = afterIndex("yellow", red1 + 1);
  const blue = afterIndex("blue", yellow + 1);
  const red2 = afterIndex("red", blue + 1);
  assert.ok(red1 >= 0 && yellow > red1 && blue > yellow && red2 > blue,
    "beklenen sıra: kırmızı zemin → sarı kalp yarısı → lacivert kalp yarısı → kırmızı zemin");
});

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
