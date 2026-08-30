"use strict";

const { ConfigStore } = require("../src/config-store");
const { InstagramSession } = require("../src/instagram");

(async () => {
  const store = new ConfigStore();
  const config = await store.load();
  const directRule = config.rules.find((rule) => rule.conversationType === "direct");
  if (!directRule) throw new Error("İncelenecek birebir sohbet kuralı yok.");

  const session = new InstagramSession(store.profileDirectory, { log: () => {} });
  try {
    await session.launch();
    const page = session.context.pages()[0] || (await session.context.newPage());
    await page.goto("https://www.instagram.com/direct/inbox/", {
      waitUntil: "domcontentloaded",
    });
    await session.assertLoggedIn(page);
    await session.openConversationByName(page, {
      conversationName: directRule.conversationName,
      conversationType: directRule.conversationType,
      rules: [directRule],
    });
    const composerVisible = await page
      .locator('[contenteditable="true"][role="textbox"]:visible')
      .last()
      .isVisible();
    console.log(`OPENED=${page.url()}`);
    console.log(`COMPOSER_VISIBLE=${composerVisible}`);
    console.log(`TARGET=${directRule.conversationName}`);
  } finally {
    await session.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
