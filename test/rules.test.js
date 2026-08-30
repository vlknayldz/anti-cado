"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONTENT_TYPES,
  CONVERSATION_TYPES,
  DELIVERY_MODES,
  PLATFORMS,
  REPEAT_MODES,
  UNLIMITED_REPEAT_VALUE,
  createRule,
  ruleSummary,
} = require("../src/rules");

function baseRule(overrides = {}) {
  return {
    platform: PLATFORMS.INSTAGRAM,
    conversationType: CONVERSATION_TYPES.GROUP,
    conversationName: "Deneme Grubu",
    senderUsername: "@OrnekKisi",
    contentType: CONTENT_TYPES.LINK,
    messageContent: "https://www.instagram.com/reel/ABC123xyz45/?igsi=test",
    copiesPerTrigger: 3,
    repeatIntervalSeconds: 1,
    deliveryMode: DELIVERY_MODES.NORMAL,
    repeatValue: 1,
    ...overrides,
  };
}

test("kural kullanıcı adını ve Instagram URL'sini normalize eder", () => {
  const rule = createRule(baseRule());
  assert.equal(rule.senderUsername, "ornekkisi");
  assert.equal(rule.messageContent, "https://www.instagram.com/reel/ABC123xyz45/");
  assert.equal(rule.repeatCount, 1);
});

test("belirli sayıda yeni mesaj işleme sınırını açıkça özetler", () => {
  const rule = createRule(
    baseRule({
      repeatValue: 5,
      repeatIntervalSeconds: 30,
    }),
  );
  assert.match(ruleSummary(rule), /İlk 5 yeni mesaj/);
  assert.match(ruleSummary(rule), /Yanıtlar arası süre: 30 saniye/);
});

test("birden fazla yanıt aralıksız kaydedilemez", () => {
  assert.throws(
    () =>
      createRule(
        baseRule({
          repeatValue: UNLIMITED_REPEAT_VALUE,
          repeatIntervalSeconds: 0,
        }),
      ),
    /Yanıtlar arası süre/,
  );
});

test("99999 değerini sınırsız tekrar olarak kaydeder ve açıkça gösterir", () => {
  const rule = createRule(
    baseRule({ repeatValue: UNLIMITED_REPEAT_VALUE, repeatIntervalSeconds: 15 }),
  );
  assert.equal(rule.repeatMode, REPEAT_MODES.UNTIL_STOPPED);
  assert.match(ruleSummary(rule), /Sınırsız yeni mesaj \(99999\)/);
});

test("99999 üzerindeki işlenecek mesaj sayısını reddeder", () => {
  assert.throws(
    () => createRule(baseRule({ repeatValue: 100000, repeatIntervalSeconds: 15 })),
    /en fazla 99999/,
  );
});

test("birebir sohbet kuralını grup kuralından ayırır", () => {
  const rule = createRule(
    baseRule({
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName: "ornekkisi",
    }),
  );
  assert.equal(rule.conversationType, CONVERSATION_TYPES.DIRECT);
  assert.match(ruleSummary(rule), /Birebir sohbet/);
});

test("eski grup kuralını geriye uyumlu biçimde dönüştürür", () => {
  const rule = createRule({
    ...baseRule(),
    conversationType: undefined,
    conversationName: undefined,
    groupName: "Ornek Grup",
    repeatValue: undefined,
    repeatMode: REPEAT_MODES.COUNT,
    repeatCount: 4,
    repeatIntervalSeconds: 20,
  });
  assert.equal(rule.conversationType, CONVERSATION_TYPES.GROUP);
  assert.equal(rule.conversationName, "Ornek Grup");
  assert.equal(rule.repeatValue, 4);
});

test("Instagram dışı bağlantıyı reddeder", () => {
  assert.throws(
    () => createRule(baseRule({ messageContent: "https://example.com/reel/1" })),
    /instagram/,
  );
});

test("X özel mesajı için düz metin kuralı oluşturur", () => {
  const rule = createRule(
    baseRule({
      platform: PLATFORMS.X,
      conversationType: CONVERSATION_TYPES.DIRECT,
      conversationName: "Test Kullanıcı",
      senderUsername: "testuser",
      contentType: CONTENT_TYPES.TEXT,
      messageContent: "Merhaba, otomatik yanıt metni",
      deliveryMode: DELIVERY_MODES.NORMAL,
    }),
  );
  assert.equal(rule.platform, PLATFORMS.X);
  assert.equal(rule.messageContent, "Merhaba, otomatik yanıt metni");
  assert.match(ruleSummary(rule), /X\/Twitter/);
  assert.match(ruleSummary(rule), /Metin/);
});

test("X gönderisi bağlantısını kabul eder", () => {
  const rule = createRule(
    baseRule({
      platform: PLATFORMS.X,
      contentType: CONTENT_TYPES.LINK,
      messageContent: "https://x.com/example/status/123?ref_src=test",
      deliveryMode: DELIVERY_MODES.NORMAL,
    }),
  );
  assert.equal(rule.messageContent, "https://x.com/example/status/123");
  assert.match(ruleSummary(rule), /Gönderi/);
});

test("X dışındaki gönderi bağlantısını X kuralında reddeder", () => {
  assert.throws(
    () =>
      createRule(
        baseRule({
          platform: PLATFORMS.X,
          messageContent: "https://example.com/status/123",
          deliveryMode: DELIVERY_MODES.NORMAL,
        }),
      ),
    /x\.com veya twitter\.com/,
  );
});

test("X özel mesajında alıntılı yanıt biçimini reddeder", () => {
  assert.throws(
    () =>
      createRule(
        baseRule({
          platform: PLATFORMS.X,
          contentType: CONTENT_TYPES.TEXT,
          messageContent: "Yanıt",
          deliveryMode: DELIVERY_MODES.REPLY,
        }),
      ),
    /normal mesaj/,
  );
});
