"use strict";

const readline = require("node:readline");
const readlinePromises = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const {
  CONTENT_TYPES,
  CONVERSATION_TYPES,
  DELIVERY_MODES,
  PLATFORMS,
  UNLIMITED_REPEAT_VALUE,
  contentTypeOf,
  conversationNameOf,
  conversationTypeOf,
  createRule,
  platformOf,
  ruleSummary,
} = require("./rules");

class BackNavigation extends Error {
  constructor() {
    super("Geri dönüldü.");
    this.name = "BackNavigation";
  }
}

function isBackNavigation(error) {
  return error instanceof BackNavigation;
}

class Prompts {
  constructor(input = stdin, output = stdout) {
    this.input = input;
    this.output = output;
    this.rl = readlinePromises.createInterface({ input, output });
    if (input.isTTY) readline.emitKeypressEvents(input, this.rl);
  }

  async question(query) {
    let escaped = false;
    const onKeypress = (_character, key) => {
      if (key?.name !== "escape") return;
      escaped = true;
      this.rl.write(null, { ctrl: true, name: "u" });
      this.rl.write("\n");
    };
    if (this.input.isTTY) this.input.on("keypress", onKeypress);
    try {
      const answer = await this.rl.question(query);
      if (escaped) throw new BackNavigation();
      return answer;
    } finally {
      if (this.input.isTTY) this.input.removeListener("keypress", onKeypress);
    }
  }

  close() {
    this.rl.close();
  }

  async waitForStop() {
    if (!this.input.isTTY || typeof this.input.setRawMode !== "function") {
      while (true) {
        const answer = await this.text("Durdurmak için DURDUR yazıp Enter'a basın");
        if (answer.trim().toLocaleLowerCase("tr-TR") === "durdur") return;
        this.output.write("Otomasyon çalışmaya devam ediyor.\n");
      }
    }

    this.output.write("\nD = anında durdur ve ana menüye dön\nESC = anında durdur ve ana menüye dön\n");
    const wasRaw = Boolean(this.input.isRaw);
    await new Promise((resolve) => {
      const onKeypress = (character, key) => {
        const normalized = String(character || "").toLocaleLowerCase("tr-TR");
        if (normalized !== "d" && key?.name !== "escape" && !(key?.ctrl && key?.name === "c")) {
          return;
        }
        this.input.removeListener("keypress", onKeypress);
        setImmediate(() => {
          this.rl.write("", { ctrl: true, name: "u" });
          this.rl.line = "";
          this.rl.cursor = 0;
          if (!wasRaw) this.input.setRawMode(false);
          this.output.write("\nDurdurma komutu alındı.\n");
          resolve();
        });
      };
      this.input.on("keypress", onKeypress);
      if (!wasRaw) this.input.setRawMode(true);
      this.input.resume();
    });
  }

  async waitForAutomationCommand() {
    if (!this.input.isTTY || typeof this.input.setRawMode !== "function") {
      const selected = await this.choose(
        "Otomasyon kontrolü:",
        ["Başlatılmamış kuralı başlat", "Çalışan kuralı durdur", "Tüm otomasyonu durdur"],
      );
      return ["start_rule", "stop_rule", "stop_all"][selected];
    }

    this.output.write(
      "\nB = başka kural başlat\nK = çalışan kuralı durdur\nD veya ESC = tüm otomasyonu durdur\n",
    );
    const wasRaw = Boolean(this.input.isRaw);
    return new Promise((resolve) => {
      const onKeypress = (character, key) => {
        const normalized = String(character || "").toLocaleLowerCase("tr-TR");
        let command = null;
        if (normalized === "b") command = "start_rule";
        if (normalized === "k") command = "stop_rule";
        if (
          normalized === "d" ||
          key?.name === "escape" ||
          (key?.ctrl && key?.name === "c")
        ) {
          command = "stop_all";
        }
        if (!command) return;
        this.input.removeListener("keypress", onKeypress);
        setImmediate(() => {
          this.rl.write("", { ctrl: true, name: "u" });
          this.rl.line = "";
          this.rl.cursor = 0;
          if (!wasRaw) this.input.setRawMode(false);
          resolve(command);
        });
      };
      this.input.on("keypress", onKeypress);
      if (!wasRaw) this.input.setRawMode(true);
      this.input.resume();
    });
  }

  async text(label, defaultValue = "") {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await this.question(`${label}${suffix}: `)).trim();
    return answer || defaultValue;
  }

  async choose(title, options, defaultIndex = 0, footerLines = [], escapeLabel = "geri") {
    while (true) {
      this.output.write(`\n${title}\n`);
      options.forEach((option, index) => this.output.write(`${index + 1}) ${option}\n`));
      if (footerLines.length) {
        this.output.write("\n");
        footerLines.forEach((line) => this.output.write(`${line}\n`));
      }
      this.output.write(`\nESC = ${escapeLabel}\n`);
      const answer = (await this.question(`Seçim [${defaultIndex + 1}]: `)).trim();
      const selected = answer === "" ? defaultIndex : Number(answer) - 1;
      if (Number.isInteger(selected) && selected >= 0 && selected < options.length) {
        return selected;
      }
      this.output.write("Geçerli bir seçenek girin.\n");
    }
  }

  async multiSelect(title, options, footerLines = []) {
    if (!options.length) return [];
    while (true) {
      this.output.write(`\n${title}\n`);
      options.forEach((option, index) => this.output.write(`${index + 1}) ${option}\n`));
      this.output.write("T) Tümünü seç\n");
      if (footerLines.length) {
        this.output.write("\n");
        footerLines.forEach((line) => this.output.write(`${line}\n`));
      }
      this.output.write("\nBirden fazla seçim: 1,3,5\nESC = geri\n");
      const answer = (await this.question("Seçilecek kural numaraları: "))
        .trim()
        .toLocaleLowerCase("tr-TR");
      if (answer === "t") return options.map((_option, index) => index);
      const parts = answer.split(/[\s,;]+/).filter(Boolean);
      const selected = [...new Set(parts.map((part) => Number(part) - 1))];
      if (
        selected.length &&
        selected.every(
          (index) => Number.isInteger(index) && index >= 0 && index < options.length,
        )
      ) {
        return selected;
      }
      this.output.write("En az bir geçerli kural numarası girin.\n");
    }
  }

  async integer(label, defaultValue, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
    while (true) {
      const raw = await this.text(label, String(defaultValue));
      const value = Number(raw);
      if (Number.isInteger(value) && value >= minimum && value <= maximum) return value;
      this.output.write(`${label} ${minimum}–${maximum} arasında tam sayı olmalı.\n`);
    }
  }

  async confirm(label, defaultYes = true) {
    const suffix = defaultYes ? "E/h" : "e/H";
    const answer = (await this.question(`${label} (${suffix}): `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "e" || answer === "evet" || answer === "y" || answer === "yes";
  }

  async ruleWizard(existing = {}) {
    while (true) {
      try {
        this.output.write("\n--- Otomasyon kuralı ---\nESC = kaydetmeden geri dön\n");
        const hasExistingRule = Boolean(
          existing.id || existing.conversationName || existing.groupName,
        );
        const platformIndex = await this.choose(
          "Hangi platformda çalışsın?",
          ["Instagram", "X/Twitter özel mesajları"],
          platformOf(existing) === PLATFORMS.X ? 1 : 0,
        );
        const platform = platformIndex === 1 ? PLATFORMS.X : PLATFORMS.INSTAGRAM;
        const existingConversationType = conversationTypeOf(existing);
        const conversationTypeIndex = await this.choose(
          "Hangi sohbet türünde çalışsın?",
          [
            "Birebir sohbet (bir kişiyle normal mesajlaşma)",
            "Grup sohbeti",
          ],
          hasExistingRule && existingConversationType !== CONVERSATION_TYPES.DIRECT ? 1 : 0,
        );
        const conversationType =
          conversationTypeIndex === 0
            ? CONVERSATION_TYPES.DIRECT
            : CONVERSATION_TYPES.GROUP;
        const conversationName = await this.text(
          conversationType === CONVERSATION_TYPES.DIRECT
            ? "Sohbette görünen kişi adı veya kullanıcı adı"
            : "Grup adı",
          conversationNameOf(existing),
        );
        const senderUsername = await this.text("Kullanıcı adı", existing.senderUsername);
        const contentTypeIndex = await this.choose(
          "Ne gönderilsin?",
          ["Gönderi", "Metin"],
          hasExistingRule && contentTypeOf(existing) === CONTENT_TYPES.TEXT ? 1 : 0,
        );
        const contentType =
          contentTypeIndex === 1 ? CONTENT_TYPES.TEXT : CONTENT_TYPES.LINK;
        const messageContent = await this.text(
          contentType === CONTENT_TYPES.TEXT
            ? "Gönderilecek metin"
            : platform === PLATFORMS.X
              ? "X gönderisinin bağlantısı"
              : "Instagram gönderisinin bağlantısı",
          existing.messageContent || existing.mediaUrl,
        );
        const copiesPerTrigger = await this.integer(
          "Her yeni hedef mesajda kaç yanıt gönderilsin",
          existing.copiesPerTrigger || 1,
        );
        let repeatIntervalSeconds = 0;
        if (copiesPerTrigger > 1) {
          repeatIntervalSeconds = await this.integer(
            "Yanıtlar arasında kaç saniye beklensin",
            existing.repeatIntervalSeconds || 1,
          );
        }

        let deliveryMode = DELIVERY_MODES.NORMAL;
        if (platform === PLATFORMS.INSTAGRAM) {
          const deliveryDefault = existing.deliveryMode === DELIVERY_MODES.REPLY ? 0 : 1;
          const deliveryIndex = await this.choose(
            "Nasıl gönderilsin?",
            [
              "Mesajına yanıt olarak (gelen mesajı alıntılar)",
              "Sohbete normal mesaj olarak (hiçbir mesaja bağlanmaz)",
            ],
            deliveryDefault,
          );
          deliveryMode =
            deliveryIndex === 0 ? DELIVERY_MODES.REPLY : DELIVERY_MODES.NORMAL;
        } else {
          this.output.write("X/Twitter yanıtı özel sohbete normal mesaj olarak gönderilecek.\n");
        }

        this.output.write(
          `\nİşlenecek mesaj sayısı: 1 = yalnızca ilk yeni mesaj, ${UNLIMITED_REPEAT_VALUE} = sınırsız yeni mesaj.\n`,
        );
        const repeatValue = await this.integer(
          "Kural kaç yeni hedef mesajı işlesin",
          existing.repeatValue || existing.repeatCount || 1,
          1,
          UNLIMITED_REPEAT_VALUE,
        );

        const rule = createRule({
          ...existing,
          platform,
          conversationType,
          conversationName,
          senderUsername,
          contentType,
          messageContent,
          copiesPerTrigger,
          deliveryMode,
          repeatValue,
          repeatIntervalSeconds,
        });

        this.output.write(`\n${ruleSummary(rule)}\n\n`);
        if (await this.confirm("Bu kural kaydedilsin mi?")) return rule;
        if (!(await this.confirm("Bilgileri yeniden girmek ister misiniz?"))) return null;
      } catch (error) {
        if (isBackNavigation(error)) {
          this.output.write("Kural değişikliği iptal edildi.\n");
          return null;
        }
        this.output.write(`Hata: ${error.message}\n`);
      }
    }
  }

  async ruleEditor(existing) {
    let draft = createRule(existing);
    while (true) {
      this.output.write("\n--- Kural Alanları ---\n");
      this.output.write(`1) Platform           : ${draft.platform === PLATFORMS.X ? "X/Twitter" : "Instagram"}\n`);
      this.output.write(
        `2) Sohbet türü       : ${draft.conversationType === CONVERSATION_TYPES.DIRECT ? "Birebir sohbet" : "Grup sohbeti"}\n`,
      );
      this.output.write(`3) Sohbet adı        : ${draft.conversationName}\n`);
      this.output.write(`4) Hedef kullanıcı   : @${draft.senderUsername}\n`);
      this.output.write(`5) İçerik türü       : ${draft.contentType === CONTENT_TYPES.TEXT ? "Metin" : "Gönderi"}\n`);
      this.output.write(`6) Gönderilecek içerik: ${draft.messageContent}\n`);
      this.output.write(`7) Mesaj başına yanıt: ${draft.copiesPerTrigger}\n`);
      this.output.write(
        `8) Gönderim biçimi   : ${draft.deliveryMode === DELIVERY_MODES.REPLY ? "Mesajına bağlı yanıt" : "Normal sohbet mesajı"}\n`,
      );
      this.output.write(`9) İşlenecek mesaj   : ${draft.repeatValue}${draft.repeatValue === UNLIMITED_REPEAT_VALUE ? " (sınırsız)" : ""}\n`);
      this.output.write(`10) Yanıtlar arası   : ${draft.repeatIntervalSeconds} saniye\n`);
      this.output.write("\nS = değişiklikleri kaydet\nESC = kaydetmeden geri dön\n");

      let command;
      try {
        command = (await this.question("Düzenlenecek alan numarası veya S: "))
          .trim()
          .toLocaleLowerCase("tr-TR");
      } catch (error) {
        if (isBackNavigation(error)) {
          this.output.write("Değişiklikler kaydedilmedi.\n");
          return null;
        }
        throw error;
      }

      if (command === "s") {
        try {
          const saved = createRule(draft);
          this.output.write(`\n${ruleSummary(saved)}\nKural kaydedildi.\n`);
          return saved;
        } catch (error) {
          this.output.write(`Kural kaydedilemedi: ${error.message}\n`);
          continue;
        }
      }

      const field = Number(command);
      if (!Number.isInteger(field) || field < 1 || field > 10) {
        this.output.write("1–10 arasında alan numarası veya kaydetmek için S girin.\n");
        continue;
      }

      try {
        if (field === 1) {
          const selected = await this.choose(
            "Platform:",
            ["Instagram", "X/Twitter özel mesajları"],
            draft.platform === PLATFORMS.X ? 1 : 0,
          );
          draft.platform = selected === 1 ? PLATFORMS.X : PLATFORMS.INSTAGRAM;
          if (draft.platform === PLATFORMS.X) {
            draft.deliveryMode = DELIVERY_MODES.NORMAL;
          }
        }
        if (field === 2) {
          const selected = await this.choose(
            "Sohbet türü:",
            ["Birebir sohbet", "Grup sohbeti"],
            draft.conversationType === CONVERSATION_TYPES.DIRECT ? 0 : 1,
          );
          draft.conversationType =
            selected === 0 ? CONVERSATION_TYPES.DIRECT : CONVERSATION_TYPES.GROUP;
        }
        if (field === 3) {
          draft.conversationName = await this.text("Yeni sohbet adı", draft.conversationName);
        }
        if (field === 4) {
          draft.senderUsername = await this.text("Yeni hedef kullanıcı adı", draft.senderUsername);
        }
        if (field === 5) {
          const selected = await this.choose(
            "İçerik türü:",
            ["Gönderi", "Metin"],
            draft.contentType === CONTENT_TYPES.TEXT ? 1 : 0,
          );
          draft.contentType = selected === 1 ? CONTENT_TYPES.TEXT : CONTENT_TYPES.LINK;
        }
        if (field === 6) {
          draft.messageContent = await this.text(
            draft.contentType === CONTENT_TYPES.TEXT
              ? "Yeni gönderilecek metin"
              : draft.platform === PLATFORMS.X
                ? "Yeni X gönderisinin bağlantısı"
                : "Yeni Instagram gönderisinin bağlantısı",
            draft.messageContent,
          );
        }
        if (field === 7) {
          draft.copiesPerTrigger = await this.integer(
            "Her yeni hedef mesajdaki yanıt adedi",
            draft.copiesPerTrigger,
          );
          if (draft.copiesPerTrigger === 1) draft.repeatIntervalSeconds = 0;
          if (draft.copiesPerTrigger > 1 && draft.repeatIntervalSeconds < 1) {
            draft.repeatIntervalSeconds = await this.integer("Yanıtlar arası süre", 1);
          }
        }
        if (field === 8) {
          if (draft.platform === PLATFORMS.X) {
            this.output.write("X/Twitter özel mesajlarında gönderim biçimi normal mesajdır.\n");
          } else {
            const selected = await this.choose(
              "Gönderim biçimi:",
              [
                "Mesajına yanıt olarak (gelen mesajı alıntılar)",
                "Sohbete normal mesaj olarak",
              ],
              draft.deliveryMode === DELIVERY_MODES.REPLY ? 0 : 1,
            );
            draft.deliveryMode =
              selected === 0 ? DELIVERY_MODES.REPLY : DELIVERY_MODES.NORMAL;
          }
        }
        if (field === 9) {
          this.output.write(
            `1 = yalnızca ilk yeni mesaj, ${UNLIMITED_REPEAT_VALUE} = sınırsız yeni mesaj.\n`,
          );
          draft.repeatValue = await this.integer(
            "İşlenecek yeni hedef mesaj sayısı",
            draft.repeatValue,
            1,
            UNLIMITED_REPEAT_VALUE,
          );
        }
        if (field === 10) {
          if (draft.copiesPerTrigger === 1) {
            this.output.write("Yanıt adedi 1 iken yanıtlar arası süre kullanılmaz.\n");
          } else {
            draft.repeatIntervalSeconds = await this.integer(
              "Yeni yanıtlar arası süre (saniye)",
              draft.repeatIntervalSeconds || 1,
            );
          }
        }
      } catch (error) {
        if (isBackNavigation(error)) {
          this.output.write("Alan değiştirilmedi; kural alanlarına dönüldü.\n");
          continue;
        }
        throw error;
      }
    }
  }
}

module.exports = { BackNavigation, Prompts, isBackNavigation };
