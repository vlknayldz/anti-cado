"use strict";

const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const {
  CONVERSATION_TYPES,
  DELIVERY_MODES,
  PLATFORMS,
  conversationKey,
  conversationNameOf,
  conversationTypeOf,
  normalizeUsername,
  platformOf,
} = require("./rules");

const INSTAGRAM_INBOX = "https://www.instagram.com/direct/inbox/";
const X_MESSAGES = "https://x.com/i/chat";

function browserCandidates() {
  return [
    process.env.IG_GRUP_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
  ].filter(Boolean);
}

function findBrowserExecutable() {
  const executable = browserCandidates().find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(
      "Google Chrome bulunamadı. Chrome'u kurun ya da IG_GRUP_CHROME_PATH ayarlayın.",
    );
  }
  return executable;
}

function escapeAttribute(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForChrome(port) {
  const endpoint = `http://127.0.0.1:${port}`;
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Google Chrome başlatılamadı: ${lastError?.message || "bağlantı kurulamadı"}`);
}

async function stopBrowserProcess(browserProcess) {
  if (!browserProcess?.pid || browserProcess.exitCode !== null) return;
  if (process.platform !== "win32") {
    browserProcess.kill();
    return;
  }
  await new Promise((resolve) => {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(browserProcess.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("error", () => {
      browserProcess.kill();
      resolve();
    });
    killer.once("exit", resolve);
  });
}

class InstagramSession {
  constructor(profileDirectory, options = {}) {
    this.profileDirectory = profileDirectory;
    this.log = options.log || console.log;
    this.browser = null;
    this.browserProcess = null;
    this.context = null;
    this.conversations = new Map();
    this.pollTimer = null;
    this.pollingActive = false;
    this.onMessage = null;
    this.sendQueues = new Map();
    this.cancelledRuleIds = new Set();
  }

  async launch() {
    if (this.context) return;
    const executablePath = findBrowserExecutable();
    let lastError;
    for (let attempt = 0; attempt < 2 && !this.context; attempt += 1) {
      const port = await availablePort();
      const browserProcess = spawn(executablePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${this.profileDirectory}`,
        "--start-maximized",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--disable-blink-features=AutomationControlled",
      ], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      browserProcess.unref();
      try {
        const endpoint = await waitForChrome(port);
        this.browser = await chromium.connectOverCDP(endpoint);
        this.context = this.browser.contexts()[0];
        this.browserProcess = browserProcess;
      } catch (error) {
        lastError = error;
        await stopBrowserProcess(browserProcess);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    if (!this.context) {
      throw new Error(`Chrome profili açılamadı: ${lastError?.message || "bilinmeyen hata"}`);
    }
    this.log(`Tarayıcı: ${path.basename(executablePath)}`);
  }

  async login(platform = PLATFORMS.INSTAGRAM) {
    await this.launch();
    const page = this.context.pages()[0] || (await this.context.newPage());
    await page.goto(platform === PLATFORMS.X ? X_MESSAGES : INSTAGRAM_INBOX, {
      waitUntil: "domcontentloaded",
    });
    await page.bringToFront();
    return page;
  }

  async assertLoggedIn(page, platform = PLATFORMS.INSTAGRAM) {
    if (platform === PLATFORMS.X) {
      if (/\/i\/flow\/login|\/login/.test(page.url())) {
        throw new Error("X/Twitter oturumu açık değil. Önce menüden X/Twitter girişi yapın.");
      }
      return;
    }
    if (/\/accounts\/login\//.test(page.url())) {
      throw new Error("Instagram oturumu açık değil. Önce menüden Instagram girişi yapın.");
    }
  }

  async openConversations(rules) {
    return this.addRules(rules);
  }

  async addRules(rules) {
    await this.launch();
    const grouped = new Map();
    for (const rule of rules.filter((candidate) => candidate.enabled)) {
      const key = conversationKey(rule);
      const entry = grouped.get(key) || {
        platform: platformOf(rule),
        conversationName: conversationNameOf(rule),
        conversationType: conversationTypeOf(rule),
        rules: [],
      };
      entry.rules.push(rule);
      grouped.set(key, entry);
    }

    for (const [key, entry] of grouped) {
      const existing = this.conversations.get(key);
      if (existing && !existing.page.isClosed()) {
        const merged = new Map(existing.rules.map((rule) => [rule.id, rule]));
        entry.rules.forEach((rule) => merged.set(rule.id, rule));
        existing.rules = [...merged.values()];
        await this.installWatcher(existing.page, existing.rules);
        this.log(
          `Kural eklendi: ${entry.platform === PLATFORMS.X ? "X/Twitter" : "Instagram"} | ${entry.conversationName}`,
        );
        continue;
      }

      const usedPages = new Set(
        [...this.conversations.values()].map((conversation) => conversation.page),
      );
      // Kullanıcının gezindiği sekme gasp edilmesin: yalnızca boş/yeni sekme
      // yeniden kullanılır, aksi halde uygulama kendi sekmesini açar.
      const blankPage = this.context.pages().find((candidate) => {
        if (usedPages.has(candidate) || typeof candidate.url !== "function") return false;
        const url = candidate.url();
        return (
          url === "" ||
          url === "about:blank" ||
          url.startsWith("chrome://newtab") ||
          url.startsWith("chrome://new-tab-page")
        );
      });
      const page = blankPage || (await this.context.newPage());
      try {
        await page.goto(entry.platform === PLATFORMS.X ? X_MESSAGES : INSTAGRAM_INBOX, {
          waitUntil: "domcontentloaded",
        });
        await this.assertLoggedIn(page, entry.platform);
        await this.openConversationByName(page, entry);
        await this.installWatcher(page, entry.rules);
      } catch (error) {
        // Uygulamanın açtığı sekme sahipsiz kalmasın; kullanıcı sekmesine dokunulmaz.
        if (!blankPage) {
          try {
            await page.close();
          } catch {}
        }
        throw error;
      }
      this.conversations.set(key, { page, ...entry });
      const typeLabel =
        entry.conversationType === CONVERSATION_TYPES.DIRECT ? "Birebir" : "Grup";
      const platformLabel = entry.platform === PLATFORMS.X ? "X/Twitter" : "Instagram";
      this.log(`Hazır: ${platformLabel} | ${typeLabel} — ${entry.conversationName} (${entry.rules.length} kural)`);
    }
  }

  async openConversationByName(page, conversation) {
    const { conversationName, conversationType, platform } = conversation;
    const typeLabel =
      conversationType === CONVERSATION_TYPES.DIRECT ? "Birebir sohbet" : "Grup";
    await page.waitForTimeout(1500);
    const targetNames = [conversationName];
    if (conversationType === CONVERSATION_TYPES.DIRECT) {
      targetNames.push(conversation.rules[0]?.senderUsername);
    }
    let clicked = await this.clickConversationEntry(page, targetNames);
    if (!clicked) {
      if (platform === PLATFORMS.X) {
        const searchBar = page.locator('[data-testid="dm-search-bar"]');
        if (await searchBar.isVisible().catch(() => false)) {
          await searchBar.click();
          await page.waitForTimeout(300);
        }
      }
      const searchBoxes =
        platform === PLATFORMS.X
          ? page.locator(
              'input[data-testid="SearchBox_Search_Input"], input[placeholder*="Search" i], input[placeholder*="Ara" i]',
            )
          : page.locator(
              'input[placeholder*="Ara" i], input[placeholder*="Search" i]',
            );
      if (await searchBoxes.count()) {
        const searchBox = searchBoxes.first();
        const searchQuery =
          platform === PLATFORMS.X && conversationType === CONVERSATION_TYPES.DIRECT
            ? normalizeUsername(conversation.rules[0]?.senderUsername || conversationName)
            : conversationName;
        await searchBox.fill(searchQuery);
        await page.waitForTimeout(1200);
        clicked = await this.clickConversationEntry(page, targetNames);
      }
    }
    if (!clicked) {
      throw new Error(
        `“${conversationName}” ${typeLabel.toLocaleLowerCase("tr-TR")} bulunamadı. Sohbet adını ${platform === PLATFORMS.X ? "X/Twitter'da" : "Instagram'da"} göründüğü gibi yazın.`,
      );
    }
    await page.waitForTimeout(1500);
    const composerVisible = await this.composerLocator(page, platform)
      .last()
      .isVisible()
      .catch(() => false);
    if (!composerVisible) {
      throw new Error(`“${conversationName}” konuşması açılamadı.`);
    }
  }

  composerLocator(page, platform) {
    return platform === PLATFORMS.X
      ? page.locator(
          '[data-testid="dm-composer-textarea"], [data-testid="dmComposerTextInput"][contenteditable="true"], [contenteditable="true"][role="textbox"]:visible',
        )
      : page.locator('[contenteditable="true"][role="textbox"]:visible');
  }

  async clickConversationEntry(page, targetNames) {
    return page.evaluate((names) => {
      const normalize = (value) =>
        String(value || "")
          .normalize("NFKC")
          .trim()
          .replace(/^@+/, "")
          .replace(/\s+/g, " ")
          .toLocaleLowerCase("tr-TR");
      const normalizedNames = names.map(normalize).filter(Boolean);
      const candidates = [...document.querySelectorAll("span, div, a")]
        .filter((element) => normalizedNames.includes(normalize(element.textContent)))
        .sort((left, right) => left.children.length - right.children.length);
      for (const candidate of candidates) {
        const clickable = candidate.closest(
          '[data-interactable*="click"], [role="button"], [role="option"], a[href], [tabindex="0"]',
        );
        if (!clickable) continue;
        const rect = clickable.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        clickable.scrollIntoView({ block: "center" });
        clickable.click();
        return true;
      }
      return false;
    }, targetNames);
  }

  async installWatcher(page, rules) {
    if (platformOf(rules[0]) === PLATFORMS.X) {
      return this.installXWatcher(page, rules);
    }
    const usernames = [...new Set(rules.map((rule) => normalizeUsername(rule.senderUsername)))];
    await page.evaluate((targets) => {
      window.__igGrupCli?.observer?.disconnect();
      const state = {
        targets,
        events: [],
        sequence: 0,
        primed: false,
        seenSignatures: new Set(),
        observer: null,
      };

      const normalized = (value) => String(value || "").trim().replace(/^@+/, "").toLowerCase();
      const rows = () => [...document.querySelectorAll('[role="group"]')];

      function usernameForRow(row) {
        const aria = normalized(row.getAttribute("aria-label"));
        for (const target of state.targets) {
          if (aria.includes(target)) return target;
          const links = [...row.querySelectorAll("a[href]")];
          if (
            links.some((link) => {
              try {
                return normalized(new URL(link.href).pathname.replace(/^\//, "").split("/")[0]) === target;
              } catch {
                return false;
              }
            })
          ) {
            return target;
          }
        }
        return null;
      }

      function rowSignatureBase(row, username) {
        const time = row.querySelector("time")?.getAttribute("datetime") || "";
        const labels = [...row.querySelectorAll("[aria-label]")]
          .map((node) => node.getAttribute("aria-label"))
          .filter(Boolean)
          .join("|");
        const media = [...row.querySelectorAll("a[href], img[src], video[src]")]
          .map((node) => node.getAttribute("href") || node.getAttribute("src") || "")
          .join("|");
        return `${username}|${time}|${row.innerText || ""}|${labels}|${media}`;
      }

      function mark(row) {
        if (!row.dataset.igGrupCliId) {
          state.sequence += 1;
          row.dataset.igGrupCliId = `ig-cli-${Date.now()}-${state.sequence}`;
        }
        return row.dataset.igGrupCliId;
      }

      function scan(emit) {
        const allRows = rows();
        const occurrences = new Map();
        allRows.forEach((row) => {
          const username = usernameForRow(row);
          if (!username) return;
          const marker = mark(row);
          const base = rowSignatureBase(row, username);
          const occurrence = (occurrences.get(base) || 0) + 1;
          occurrences.set(base, occurrence);
          const signature = `${base}|occurrence:${occurrence}`;
          if (row.dataset.igGrupCliProcessed === "1") return;
          row.dataset.igGrupCliProcessed = "1";
          row.dataset.igGrupCliSignature = signature;
          if (!state.seenSignatures.has(signature) && emit) {
            state.events.push({
              marker,
              signature,
              username,
              preview: (row.innerText || "[medya]").trim().slice(0, 120),
            });
          }
          state.seenSignatures.add(signature);
        });
      }

      scan(false);
      state.primed = true;
      let pending = null;
      state.observer = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => scan(true), 180);
      });
      state.observer.observe(document.body, { childList: true, subtree: true });
      window.__igGrupCli = state;
    }, usernames);
  }

  async installXWatcher(page, rules) {
    const usernames = [...new Set(rules.map((rule) => normalizeUsername(rule.senderUsername)))];
    const directConversation =
      conversationTypeOf(rules[0]) === CONVERSATION_TYPES.DIRECT;
    await page.evaluate(({ targets, direct }) => {
      window.__igGrupCli?.observer?.disconnect();
      const state = {
        targets,
        events: [],
        sequence: 0,
        seenSignatures: new Set(),
        observer: null,
      };
      const normalized = (value) =>
        String(value || "").trim().replace(/^@+/, "").toLowerCase();
      const rows = () => [
        ...document.querySelectorAll(
          '[data-testid^="message-"], [data-testid="messageEntry"], [data-testid="DMMessage"], [data-testid="dmMessageEntry"]',
        ),
      ];

      function usernameForRow(row) {
        if (row.classList.contains("justify-end")) return null;
        if (direct && state.targets.length) return state.targets[0];
        const searchable = normalized(
          `${row.getAttribute("aria-label") || ""} ${row.innerText || ""}`,
        );
        const links = [...row.querySelectorAll("a[href]")];
        for (const target of state.targets) {
          if (searchable.includes(`@${target}`)) return target;
          if (
            links.some((link) => {
              try {
                const path = new URL(link.href).pathname.replace(/^\//, "").split("/")[0];
                return normalized(path) === target;
              } catch {
                return false;
              }
            })
          ) {
            return target;
          }
        }
        return null;
      }

      function mark(row) {
        if (!row.dataset.igGrupCliId) {
          state.sequence += 1;
          row.dataset.igGrupCliId = `x-cli-${Date.now()}-${state.sequence}`;
        }
        return row.dataset.igGrupCliId;
      }

      function scan(emit) {
        const occurrences = new Map();
        rows().forEach((row) => {
          const username = usernameForRow(row);
          if (!username) return;
          const base = `${username}|${row.getAttribute("aria-label") || ""}|${row.innerText || ""}`;
          const occurrence = (occurrences.get(base) || 0) + 1;
          occurrences.set(base, occurrence);
          const signature = `${base}|occurrence:${occurrence}`;
          const marker = mark(row);
          if (row.dataset.igGrupCliProcessed === "1") return;
          row.dataset.igGrupCliProcessed = "1";
          if (!state.seenSignatures.has(signature) && emit) {
            state.events.push({
              marker,
              signature,
              username,
              preview: (row.innerText || "[mesaj]").trim().slice(0, 120),
            });
          }
          state.seenSignatures.add(signature);
        });
      }

      scan(false);
      let pending = null;
      state.observer = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => scan(true), 180);
      });
      state.observer.observe(document.body, { childList: true, subtree: true });
      window.__igGrupCli = state;
    }, { targets: usernames, direct: directConversation });
  }

  async pollOnce() {
    for (const [key, conversation] of this.conversations) {
      if (conversation.page.isClosed()) continue;
      const events = await conversation.page.evaluate(() => {
        const events = window.__igGrupCli?.events || [];
        if (window.__igGrupCli) window.__igGrupCli.events = [];
        return events;
      });
      for (const event of events) {
        const matchingRules = conversation.rules.filter(
          (rule) => normalizeUsername(rule.senderUsername) === event.username,
        );
        for (const rule of matchingRules) {
          this.onMessage?.(rule, {
            ...event,
            conversationKey: key,
            conversationName: conversation.conversationName,
            conversationType: conversation.conversationType,
            platform: conversation.platform,
          });
        }
      }
    }
  }

  startPolling(onMessage, intervalMs = 750) {
    this.onMessage = onMessage;
    this.pollingActive = true;
    // setInterval yerine zincirli setTimeout: yavaş bir tarama bitmeden
    // yenisi başlamaz, çağrılar üst üste binemez.
    const tick = async () => {
      if (!this.pollingActive) return;
      try {
        await this.pollOnce();
      } catch (error) {
        this.log(`İzleme uyarısı: ${error.message}`);
      }
      if (this.pollingActive) this.pollTimer = setTimeout(tick, intervalMs);
    };
    this.pollTimer = setTimeout(tick, intervalMs);
  }

  queueSend(rule, event) {
    const key = conversationKey(rule);
    const previous = this.sendQueues.get(key) || Promise.resolve();
    const next = previous.then(() => this.sendCycle(rule, event));
    this.sendQueues.set(key, next.catch(() => {}));
    return next;
  }

  activateRule(ruleId) {
    this.cancelledRuleIds.delete(ruleId);
  }

  cancelRule(ruleId) {
    this.cancelledRuleIds.add(ruleId);
  }

  async sendCycle(rule, event) {
    if (this.cancelledRuleIds.has(rule.id)) return;
    const conversation = this.conversations.get(conversationKey(rule));
    if (!conversation || conversation.page.isClosed()) {
      throw new Error("Sohbet sekmesi kapatılmış.");
    }
    for (let index = 0; index < rule.copiesPerTrigger; index += 1) {
      if (this.cancelledRuleIds.has(rule.id)) break;
      if (rule.deliveryMode === DELIVERY_MODES.REPLY) {
        await this.activateReply(conversation.page, event.marker);
      }
      await this.sendText(conversation.page, rule.messageContent, rule.platform);
      this.log(
        `[${conversationNameOf(rule)}] ${rule.senderUsername}: ${index + 1}/${rule.copiesPerTrigger} gönderildi.`,
      );
      if (
        index + 1 < rule.copiesPerTrigger &&
        !this.cancelledRuleIds.has(rule.id)
      ) {
        await conversation.page.waitForTimeout(rule.repeatIntervalSeconds * 1000);
      }
    }
  }

  async activateReply(page, marker) {
    const row = page.locator(`[data-ig-grup-cli-id="${escapeAttribute(marker)}"]`);
    if (!(await row.count())) {
      throw new Error("Yanıtlanacak kaynak mesaj artık ekranda değil.");
    }
    await row.first().hover();
    const replyButtons = page.getByRole("button", { name: /^(Yanıtla|Reply)$/i });
    for (let index = (await replyButtons.count()) - 1; index >= 0; index -= 1) {
      const button = replyButtons.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        return;
      }
    }
    const replyIcon = page.locator('svg[aria-label="Yanıtla"], svg[aria-label="Reply"]');
    if (await replyIcon.count()) {
      await replyIcon.last().locator("xpath=ancestor::button[1]").click();
      return;
    }
    throw new Error("Instagram’ın Yanıtla düğmesi bulunamadı.");
  }

  async sendText(page, text, platform = PLATFORMS.INSTAGRAM) {
    const composer = this.composerLocator(page, platform).last();
    await composer.waitFor({ state: "visible", timeout: 10000 });
    const draft = String(
      (await composer.evaluate((element) =>
        "value" in element ? element.value : element.textContent,
      )) || "",
    ).trim();
    if (draft) throw new Error("Mesaj kutusunda kullanıcıya ait bir taslak var; gönderim durduruldu.");
    await composer.focus();
    await page.keyboard.insertText(text);
    if (platform === PLATFORMS.X) {
      const sendButton = page.locator(
        '[data-testid="dm-composer-send-button"]:visible, [data-testid="dmComposerSendButton"]:visible',
      );
      if (await sendButton.count()) await sendButton.last().click();
      else await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(900);
    const remaining = String(
      (await composer.evaluate((element) =>
        "value" in element ? element.value : element.textContent,
      )) || "",
    ).trim();
    if (remaining.includes(text)) {
      throw new Error(`${platform === PLATFORMS.X ? "X/Twitter" : "Instagram"} gönderimi doğrulanamadı.`);
    }
  }

  async close() {
    this.pollingActive = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    await this.browser?.close();
    await stopBrowserProcess(this.browserProcess);
    this.browser = null;
    this.browserProcess = null;
    this.context = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

module.exports = { InstagramSession, findBrowserExecutable };
