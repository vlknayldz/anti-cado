"use strict";

const { InstagramSession } = require("../src/instagram");
const { ConfigStore } = require("../src/config-store");
const { CONVERSATION_TYPES, PLATFORMS } = require("../src/rules");

const target = String(process.argv[2] || "").trim();
if (!target) throw new Error("Kullanım: node scripts/inspect-x-conversation.js @kullanici");

(async () => {
  const store = new ConfigStore();
  const session = new InstagramSession(store.profileDirectory, { log: () => {} });
  try {
    const page = await session.login(PLATFORMS.X);
    await page.waitForTimeout(2500);
    const conversation = {
      platform: PLATFORMS.X,
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName: target,
      rules: [{ senderUsername: target }],
    };
    let openError = null;
    try {
      await session.openConversationByName(page, conversation);
    } catch (error) {
      openError = error.message;
    }
    const details = await page.evaluate(() => {
      const testIds = [...document.querySelectorAll("[data-testid]")]
        .map((element) => element.getAttribute("data-testid"))
        .filter(Boolean);
      const counts = {};
      for (const testId of testIds) counts[testId] = (counts[testId] || 0) + 1;
      const describe = (element) => ({
        tag: element.tagName,
        role: element.getAttribute("role"),
        testid: element.getAttribute("data-testid"),
        contenteditable: element.getAttribute("contenteditable"),
        placeholder: element.getAttribute("placeholder"),
        ariaLabel: element.getAttribute("aria-label"),
      });
      return {
        testIds: Object.entries(counts)
          .filter(([key]) => key.toLowerCase().includes("dm") || key.toLowerCase().includes("message"))
          .sort((left, right) => right[1] - left[1])
          .slice(0, 100),
        editors: [...document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]')]
          .map(describe),
        buttons: [...document.querySelectorAll("button, [role=button]")]
          .map(describe)
          .filter((item) => item.testid || /gönder|send/i.test(item.ariaLabel || ""))
          .slice(0, 80),
        messages: [...document.querySelectorAll('[data-testid^="message-"]')]
          .slice(-8)
          .map((row) => ({
            row: Object.fromEntries(row.getAttributeNames().map((name) => [name, row.getAttribute(name)])),
            children: [...row.querySelectorAll("[data-testid], [aria-label], a[href]")]
              .slice(0, 30)
              .map((element) => ({
                tag: element.tagName,
                attributes: Object.fromEntries(
                  element.getAttributeNames().map((name) => [name, element.getAttribute(name)]),
                ),
              })),
          })),
      };
    });
    const composer = session.composerLocator(page, PLATFORMS.X).last();
    await composer.fill("Anti-Çado gönderim düğmesi testi");
    await page.waitForTimeout(250);
    const draftButtons = await page
      .locator('button[data-testid], [role="button"][data-testid]')
      .evaluateAll((elements) =>
        elements
          .map((element) => ({
            testid: element.getAttribute("data-testid"),
            ariaLabel: element.getAttribute("aria-label"),
          }))
          .filter((item) => /send|gönder|composer/i.test(`${item.testid} ${item.ariaLabel}`)),
      );
    await composer.fill("");

    await session.installXWatcher(page, [{
      platform: PLATFORMS.X,
      conversationType: CONVERSATION_TYPES.DIRECT,
      senderUsername: target,
    }]);
    const initialEventCount = await page.evaluate(() => window.__igGrupCli.events.length);
    await page.evaluate(() => {
      const incoming = document.createElement("div");
      incoming.dataset.testid = "message-anticado-incoming-test";
      incoming.className = "justify-start";
      incoming.textContent = "synthetic incoming";
      incoming.dataset.anticadoSynthetic = "1";
      const outgoing = document.createElement("div");
      outgoing.dataset.testid = "message-anticado-outgoing-test";
      outgoing.className = "justify-end";
      outgoing.textContent = "synthetic outgoing";
      outgoing.dataset.anticadoSynthetic = "1";
      document.body.append(incoming, outgoing);
    });
    await page.waitForTimeout(500);
    const syntheticEvents = await page.evaluate(() => {
      const events = window.__igGrupCli.events.map((event) => ({
        username: event.username,
        preview: event.preview,
      }));
      document.querySelectorAll('[data-anticado-synthetic="1"]').forEach((element) => element.remove());
      return events;
    });
    console.log(`URL=${page.url()}`);
    console.log(`OPEN_ERROR=${openError || "none"}`);
    console.log(`DETAILS=${JSON.stringify(details)}`);
    console.log(`DRAFT_BUTTONS=${JSON.stringify(draftButtons)}`);
    console.log(`WATCHER_INITIAL=${initialEventCount}`);
    console.log(`WATCHER_SYNTHETIC=${JSON.stringify(syntheticEvents)}`);
  } finally {
    await session.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
