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
  const makePage = (url = "about:blank") => ({
    url: () => url,
    goto: async () => {},
    close: async () => {},
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

function fakeSessionWithPages(pages) {
  const session = new InstagramSession("unused", { log: () => {} });
  session.launch = async () => {
    session.context = {
      pages: () => pages,
      newPage: async () => {
        const page = {
          url: () => "about:blank",
          goto: async () => {},
          close: async () => {
            page.closed = true;
          },
          isClosed: () => false,
        };
        pages.push(page);
        return page;
      },
    };
  };
  session.assertLoggedIn = async () => {};
  session.installWatcher = async () => {};
  return session;
}

function directRule(id, conversationName) {
  return createRule({
    id,
    platform: PLATFORMS.INSTAGRAM,
    conversationType: CONVERSATION_TYPES.DIRECT,
    conversationName,
    senderUsername: "hedef",
    contentType: CONTENT_TYPES.TEXT,
    messageContent: "Yanıt",
    copiesPerTrigger: 1,
    deliveryMode: DELIVERY_MODES.NORMAL,
    repeatValue: 1,
  });
}

test("kullanıcının gezindiği sekmeyi gasp etmez, yeni sekme açar", async () => {
  const userPage = {
    url: () => "https://www.instagram.com/explore/",
    goto: async () => {},
    close: async () => {},
    isClosed: () => false,
  };
  const pages = [userPage];
  const session = fakeSessionWithPages(pages);
  session.openConversationByName = async () => {};

  const rule = directRule("no-steal", "Sohbet A");
  await session.addRules([rule]);

  const conversationPage = session.conversations.get(conversationKey(rule)).page;
  assert.notEqual(conversationPage, userPage);
  assert.equal(pages.length, 2);
});

test("sohbet açılamazsa uygulamanın açtığı sekme kapatılır", async () => {
  const userPage = {
    url: () => "https://www.instagram.com/explore/",
    goto: async () => {},
    close: async () => {},
    isClosed: () => false,
  };
  const pages = [userPage];
  const session = fakeSessionWithPages(pages);
  session.openConversationByName = async () => {
    throw new Error("Sohbet bulunamadı.");
  };

  await assert.rejects(
    () => session.addRules([directRule("orphan", "Sohbet B")]),
    /Sohbet bulunamadı/,
  );
  assert.equal(session.conversations.size, 0);
  assert.equal(pages[1].closed, true);
});

test("izleme döngüsü yavaş sayfada üst üste binmez", async () => {
  const session = new InstagramSession("unused", { log: () => {} });
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  session.pollOnce = async () => {
    calls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 40));
    inFlight -= 1;
  };

  session.startPolling(() => {}, 10);
  await new Promise((resolve) => setTimeout(resolve, 160));
  await session.close();

  assert.ok(calls >= 2, `en az iki tarama beklenirdi, ${calls} oldu`);
  assert.equal(maxInFlight, 1);
});
