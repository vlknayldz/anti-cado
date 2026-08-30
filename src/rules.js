"use strict";

const { randomUUID } = require("node:crypto");

const DELIVERY_MODES = Object.freeze({
  REPLY: "reply",
  NORMAL: "normal",
});

const CONVERSATION_TYPES = Object.freeze({
  DIRECT: "direct",
  GROUP: "group",
});

const PLATFORMS = Object.freeze({
  INSTAGRAM: "instagram",
  X: "x",
});

const CONTENT_TYPES = Object.freeze({
  LINK: "link",
  TEXT: "text",
});

const REPEAT_MODES = Object.freeze({
  ONCE: "once",
  COUNT: "count",
  UNTIL_STOPPED: "until_stopped",
});

const UNLIMITED_REPEAT_VALUE = 99999;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizePostUrl(value, platform) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Gönderi bağlantısı geçerli bir adres olmalı (https://... biçiminde).");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("Gönderi bağlantısı http veya https olmalı.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowedHosts =
    platform === PLATFORMS.X
      ? new Set(["x.com", "twitter.com"])
      : new Set(["instagram.com"]);
  if (!allowedHosts.has(hostname)) {
    throw new Error(
      platform === PLATFORMS.X
        ? "Gönderi bağlantısı x.com veya twitter.com adresinden olmalı."
        : "Gönderi bağlantısı instagram.com adresinden olmalı.",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function platformOf(rule) {
  return Object.values(PLATFORMS).includes(rule.platform)
    ? rule.platform
    : PLATFORMS.INSTAGRAM;
}

function contentTypeOf(rule) {
  if (Object.values(CONTENT_TYPES).includes(rule.contentType)) return rule.contentType;
  return rule.mediaUrl ? CONTENT_TYPES.LINK : CONTENT_TYPES.TEXT;
}

function normalizeMessageContent(input, platform, contentType) {
  const value = String(input.messageContent || input.mediaUrl || "").trim();
  if (!value) throw new Error("Gönderilecek içerik boş bırakılamaz.");
  if (contentType === CONTENT_TYPES.TEXT) return value;
  return normalizePostUrl(value, platform);
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${field} en az 1 olan tam sayı olmalı.`);
  }
  return number;
}

function repeatValueFromInput(input) {
  if (input.repeatValue !== undefined && input.repeatValue !== null) {
    return positiveInteger(input.repeatValue, "İşlenecek mesaj sayısı");
  }
  if (input.repeatMode === REPEAT_MODES.UNTIL_STOPPED) return UNLIMITED_REPEAT_VALUE;
  if (input.repeatMode === REPEAT_MODES.COUNT) {
    return positiveInteger(input.repeatCount, "İşlenecek mesaj sayısı");
  }
  return 1;
}

function conversationNameOf(rule) {
  return String(rule.conversationName || rule.groupName || "").trim();
}

function conversationTypeOf(rule) {
  return Object.values(CONVERSATION_TYPES).includes(rule.conversationType)
    ? rule.conversationType
    : CONVERSATION_TYPES.GROUP;
}

function conversationKey(rule) {
  return `${platformOf(rule)}:${conversationTypeOf(rule)}:${conversationNameOf(rule).toLocaleLowerCase("tr-TR")}`;
}

function createRule(input) {
  const platform = platformOf(input);
  const conversationType = conversationTypeOf(input);
  const conversationName = conversationNameOf(input);
  const senderUsername = normalizeUsername(input.senderUsername);
  if (!conversationName) throw new Error("Sohbet adı boş bırakılamaz.");
  if (!senderUsername) throw new Error("Kullanıcı adı boş bırakılamaz.");

  const deliveryMode = input.deliveryMode;
  if (!Object.values(DELIVERY_MODES).includes(deliveryMode)) {
    throw new Error("Geçersiz gönderim biçimi.");
  }
  if (platform === PLATFORMS.X && deliveryMode !== DELIVERY_MODES.NORMAL) {
    throw new Error("X özel mesajlarında gönderim biçimi normal mesaj olmalı.");
  }

  const contentType = contentTypeOf(input);

  const copiesPerTrigger = positiveInteger(input.copiesPerTrigger, "Yanıt adedi");
  const repeatValue = repeatValueFromInput(input);
  if (repeatValue > UNLIMITED_REPEAT_VALUE) {
    throw new Error(`İşlenecek mesaj sayısı en fazla ${UNLIMITED_REPEAT_VALUE} olabilir.`);
  }

  const repeatMode =
    repeatValue === 1
      ? REPEAT_MODES.ONCE
      : repeatValue === UNLIMITED_REPEAT_VALUE
        ? REPEAT_MODES.UNTIL_STOPPED
        : REPEAT_MODES.COUNT;

  const rule = {
    id: input.id || randomUUID(),
    platform,
    conversationType,
    conversationName,
    senderUsername,
    contentType,
    messageContent: normalizeMessageContent(input, platform, contentType),
    copiesPerTrigger,
    deliveryMode,
    repeatMode,
    repeatValue,
    repeatCount: repeatValue,
    repeatIntervalSeconds: 0,
    enabled: input.enabled !== false,
  };

  if (copiesPerTrigger > 1) {
    rule.repeatIntervalSeconds = positiveInteger(
      input.repeatIntervalSeconds,
      "Yanıtlar arası süre",
    );
  }

  return rule;
}

function deliveryLabel(rule) {
  return rule.deliveryMode === DELIVERY_MODES.REPLY
    ? "Gelen mesaja bağlı yanıt"
    : "Sohbete normal mesaj";
}

function conversationLabel(rule) {
  return conversationTypeOf(rule) === CONVERSATION_TYPES.DIRECT
    ? `Birebir sohbet — ${conversationNameOf(rule)}`
    : `Grup sohbeti — ${conversationNameOf(rule)}`;
}

function platformLabel(rule) {
  return platformOf(rule) === PLATFORMS.X ? "X/Twitter" : "Instagram";
}

function contentLabel(rule) {
  const content = rule.messageContent || rule.mediaUrl || "";
  if (contentTypeOf(rule) === CONTENT_TYPES.TEXT) {
    const preview = content.replace(/\s+/g, " ").slice(0, 60);
    return `Metin — ${preview}${content.length > 60 ? "…" : ""}`;
  }
  return `Gönderi — ${content}`;
}

function repeatLabel(rule) {
  if (rule.repeatMode === REPEAT_MODES.ONCE) return "Yalnızca ilk yeni mesaj";
  if (rule.repeatMode === REPEAT_MODES.COUNT) {
    return `İlk ${rule.repeatCount} yeni mesaj`;
  }
  return `Sınırsız yeni mesaj (${UNLIMITED_REPEAT_VALUE})`;
}

function ruleSummary(rule) {
  const lines = [
    `${rule.senderUsername} mesaj attığında:`,
    `  Platform: ${platformLabel(rule)}`,
    `  Sohbet: ${conversationLabel(rule)}`,
    `  İçerik: ${contentLabel(rule)}`,
    `  Her yeni hedef mesajda: ${rule.copiesPerTrigger} ayrı yanıt`,
    `  Gönderim: ${deliveryLabel(rule)}`,
    `  İşlenecek mesaj: ${repeatLabel(rule)}`,
  ];
  if (rule.copiesPerTrigger > 1) {
    lines.push(`  Yanıtlar arası süre: ${rule.repeatIntervalSeconds} saniye`);
  }
  return lines.join("\n");
}

function compactRuleSummary(rule, index) {
  const state = rule.enabled ? "AÇIK" : "KAPALI";
  const repeat =
    rule.repeatMode === REPEAT_MODES.UNTIL_STOPPED
      ? `${UNLIMITED_REPEAT_VALUE} (sınırsız)`
      : String(rule.repeatCount);
  const content = contentTypeOf(rule) === CONTENT_TYPES.TEXT ? "metin" : "gönderi";
  return `${index + 1}) [${state}] ${platformLabel(rule)} | ${conversationLabel(rule)} | @${rule.senderUsername} | ${content} | mesaj başına ${rule.copiesPerTrigger} yanıt | işlenecek mesaj ${repeat}`;
}

module.exports = {
  CONTENT_TYPES,
  CONVERSATION_TYPES,
  DELIVERY_MODES,
  PLATFORMS,
  REPEAT_MODES,
  UNLIMITED_REPEAT_VALUE,
  conversationKey,
  conversationNameOf,
  conversationTypeOf,
  contentTypeOf,
  compactRuleSummary,
  createRule,
  normalizeUsername,
  platformOf,
  ruleSummary,
};
