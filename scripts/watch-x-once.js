"use strict";

const { InstagramSession } = require("../src/instagram");
const { ConfigStore } = require("../src/config-store");
const { CONVERSATION_TYPES, PLATFORMS } = require("../src/rules");

const target = String(process.argv[2] || "").trim();
if (!target) throw new Error("Kullanım: node scripts/watch-x-once.js @kullanici");

(async () => {
  const store = new ConfigStore();
  const session = new InstagramSession(store.profileDirectory, { log: () => {} });
  try {
    const page = await session.login(PLATFORMS.X);
    await page.waitForTimeout(2000);
    const rule = {
      platform: PLATFORMS.X,
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName: target,
      senderUsername: target,
      enabled: true,
    };
    await session.openConversationByName(page, {
      platform: PLATFORMS.X,
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName: target,
      rules: [rule],
    });
    await session.installXWatcher(page, [rule]);
    console.log(`READY=${target}`);
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const event = await page.evaluate(() => window.__igGrupCli.events.shift() || null);
      if (event) {
        console.log(`DETECTED=${event.username}`);
        return;
      }
      await page.waitForTimeout(500);
    }
    throw new Error("120 saniye içinde yeni mesaj algılanmadı.");
  } finally {
    await session.close();
  }
})().catch((error) => {
  console.error(`ERROR=${error.message}`);
  process.exitCode = 1;
});
