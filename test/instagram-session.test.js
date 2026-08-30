"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { InstagramSession } = require("../src/instagram");
const {
  CONTENT_TYPES,
  CONVERSATION_TYPES,
  DELIVERY_MODES,
  PLATFORMS,
  UNLIMITED_REPEAT_VALUE,
  conversationKey,
  createRule,
} = require("../src/rules");

test("bir gelen mesaj için seçilen sayıda yanıt gönderir ve sonra durur", async () => {
  const sent = [];
  const waits = [];
  const page = {
    isClosed: () => false,
    waitForTimeout: async (milliseconds) => waits.push(milliseconds),
  };
  const session = new InstagramSession("unused", { log: () => {} });
  session.sendText = async (_page, content, platform) => sent.push({ content, platform });

  const rule = createRule({
    platform: PLATFORMS.INSTAGRAM,
    conversationType: CONVERSATION_TYPES.DIRECT,
    conversationName: "Test Kişi",
    senderUsername: "testkisi",
    contentType: CONTENT_TYPES.TEXT,
    messageContent: "Yanıt",
    copiesPerTrigger: 3,
    deliveryMode: DELIVERY_MODES.NORMAL,
    repeatValue: UNLIMITED_REPEAT_VALUE,
    repeatIntervalSeconds: 2,
  });
  session.conversations.set(conversationKey(rule), { page });

  await session.sendCycle(rule, { marker: "incoming-1" });

  assert.deepEqual(sent, [
    { content: "Yanıt", platform: PLATFORMS.INSTAGRAM },
    { content: "Yanıt", platform: PLATFORMS.INSTAGRAM },
    { content: "Yanıt", platform: PLATFORMS.INSTAGRAM },
  ]);
  assert.deepEqual(waits, [2000, 2000]);
});

test("farklı sohbet kuralları ayrı sayfalarda, sonradan eklenen aynı sohbet kuralı mevcut sayfada çalışır", async () => {
  const pages = [];
  const opened = [];
  const watched = [];
  const makePage = () => ({
    goto: async () => {},
    isClosed: () => false,
  });
  pages.push(makePage());

  const session = new InstagramSession("unused", { log: () => {} });
  session.launch = async () => {
    session.context = {
      pages: () => pages,
      newPage: async () => {
        const page = makePage();
        pages.push(page);
        return page;
      },
    };
  };
  session.assertLoggedIn = async () => {};
  session.openConversationByName = async (page, conversation) => {
    opened.push({ page, name: conversation.conversationName });
  };
  session.installWatcher = async (page, rules) => {
    watched.push({ page, ids: rules.map((rule) => rule.id) });
  };

  const makeRule = (id, conversationName, senderUsername) =>
    createRule({
      id,
      platform: PLATFORMS.INSTAGRAM,
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName,
      senderUsername,
      contentType: CONTENT_TYPES.TEXT,
      messageContent: "Yanıt",
      copiesPerTrigger: 1,
      deliveryMode: DELIVERY_MODES.NORMAL,
      repeatValue: UNLIMITED_REPEAT_VALUE,
    });
  const first = makeRule("first", "Sohbet A", "kisi_a");
  const second = makeRule("second", "Sohbet B", "kisi_b");
  const later = makeRule("later", "Sohbet A", "kisi_c");

  await session.addRules([first, second]);
  assert.equal(session.conversations.size, 2);
  assert.equal(pages.length, 2);
  assert.deepEqual(opened.map((entry) => entry.name), ["Sohbet A", "Sohbet B"]);

  const firstPage = session.conversations.get(conversationKey(first)).page;
  await session.addRules([later]);
  assert.equal(session.conversations.get(conversationKey(first)).page, firstPage);
  assert.deepEqual(
    session.conversations.get(conversationKey(first)).rules.map((rule) => rule.id),
    ["first", "later"],
  );
  assert.deepEqual(watched.at(-1), { page: firstPage, ids: ["first", "later"] });
});

test("çalışırken durdurulan kuralın kalan mesaj kopyaları gönderilmez", async () => {
  const sent = [];
  const page = {
    isClosed: () => false,
    waitForTimeout: async () => {},
  };
  const session = new InstagramSession("unused", { log: () => {} });
  const rule = createRule({
    id: "cancel-during-cycle",
    platform: PLATFORMS.INSTAGRAM,
    conversationType: CONVERSATION_TYPES.DIRECT,
    conversationName: "Test Kişi",
    senderUsername: "testkisi",
    contentType: CONTENT_TYPES.TEXT,
    messageContent: "Yanıt",
    copiesPerTrigger: 3,
    deliveryMode: DELIVERY_MODES.NORMAL,
    repeatValue: UNLIMITED_REPEAT_VALUE,
    repeatIntervalSeconds: 1,
  });
  session.sendText = async () => {
    sent.push("Yanıt");
    session.cancelRule(rule.id);
  };
  session.conversations.set(conversationKey(rule), { page });

  await session.sendCycle(rule, { marker: "incoming" });

  assert.deepEqual(sent, ["Yanıt"]);
});
