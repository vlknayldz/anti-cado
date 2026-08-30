"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ConfigStore } = require("../src/config-store");

test("eski grup ayar dosyasını yeni sohbet modeline dönüştürür", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "anticado-config-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(directory, "config.json"),
    JSON.stringify({
      version: 1,
      rules: [
        {
          id: "legacy-rule",
          groupName: "Ornek Grup",
          senderUsername: "ornekkisi",
          mediaUrl: "https://www.instagram.com/reel/ABC123xyz45/",
          copiesPerTrigger: 3,
          deliveryMode: "normal",
          repeatMode: "once",
          repeatCount: 1,
          repeatIntervalSeconds: 0,
          enabled: true,
        },
      ],
    }),
  );

  const config = await new ConfigStore(directory).load();
  assert.equal(config.version, 3);
  assert.equal(config.rules[0].conversationType, "group");
  assert.equal(config.rules[0].conversationName, "Ornek Grup");
  assert.equal(config.rules[0].repeatValue, 1);
  assert.equal(config.rules[0].repeatIntervalSeconds, 1);
});

test("yanıt aralığı alanı hiç olmayan eski çoklu yanıt kuralını okuyabilir", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "anticado-config-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(directory, "config.json"),
    JSON.stringify({
      version: 2,
      rules: [
        {
          id: "missing-interval",
          conversationType: "group",
          conversationName: "Eski Grup",
          senderUsername: "hedef",
          messageContent: "Merhaba",
          contentType: "text",
          copiesPerTrigger: 2,
          deliveryMode: "normal",
          repeatValue: 1,
          enabled: true,
        },
      ],
    }),
  );

  const config = await new ConfigStore(directory).load();
  assert.equal(config.rules.length, 1);
  assert.equal(config.rules[0].repeatIntervalSeconds, 1);
});
