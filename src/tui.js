"use strict";

const blessed = require("neo-blessed");
const { AutomationController } = require("./automation-controller");
const {
  PLATFORMS,
  contentTypeOf,
  conversationNameOf,
  conversationTypeOf,
} = require("./rules");

const FENER_YELLOW = "yellow";
const FENER_NAVY = "blue";
const EMBLEM_WIDTH = 18;
const EMBLEM_PIXEL_HEIGHT = 16;

function logoDimensions() {
  return {
    boxHeight: EMBLEM_PIXEL_HEIGHT / 2 + 3,
    boxWidth: EMBLEM_WIDTH + 2,
    cellHeight: EMBLEM_PIXEL_HEIGHT / 2,
    cellWidth: EMBLEM_WIDTH,
    logTop: EMBLEM_PIXEL_HEIGHT / 2 + 4,
  };
}

function cliEmblemPixel(x, y, width, pixelHeight) {
  const centerX = (width - 1) / 2;
  const centerY = (pixelHeight - 1) / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx ** 2 + dy ** 2);
  const radius = Math.min(width, pixelHeight) / 2 - 0.6;

  // Gerçek amblem katmanları: lacivert zemin > beyaz halka > kırmızı disk
  // > yeşil palamut dalı > sarı-lacivert kalp.
  if (distance > radius) return FENER_NAVY;
  if (distance > radius - 2.2) return "white";

  const stem = Math.abs(dx) < 0.55 && dy > -4.4 && dy < -1.6;
  const leftLeaf = ((dx + 1.6) / 1.3) ** 2 + ((dy + 3.9) / 0.85) ** 2 < 1;
  const rightLeaf = ((dx - 1.6) / 1.3) ** 2 + ((dy + 3.5) / 0.85) ** 2 < 1;
  if (stem || leftLeaf || rightLeaf) return "green";

  // Kalp: (u² + v² - 1)³ - u² · v³ < 0 klasik kalp eğrisi; v yukarı bakar.
  const u = dx / 3.0;
  const v = (1.0 - dy) / 2.7;
  const heart = (u ** 2 + v ** 2 - 1) ** 3 - u ** 2 * v ** 3 < 0;
  if (heart) return dx < 0 ? FENER_YELLOW : FENER_NAVY;

  return "red";
}

function renderCliEmblem(width = EMBLEM_WIDTH, pixelHeight = EMBLEM_PIXEL_HEIGHT) {
  const rows = [];
  for (let y = 0; y < pixelHeight; y += 2) {
    let line = "";
    for (let x = 0; x < width; x += 1) {
      const top = cliEmblemPixel(x, y, width, pixelHeight);
      const bottom = cliEmblemPixel(x, Math.min(y + 1, pixelHeight - 1), width, pixelHeight);
      line += `{${top}-fg}{${bottom}-bg}▀{/}`;
    }
    rows.push(line);
  }
  return rows.join("\n");
}

function safeText(value) {
  return String(value || "").replace(/[{}]/g, "");
}

function platformLabel(rule) {
  return rule.platform === PLATFORMS.X ? "X" : "Instagram";
}

function ruleLine(rule, activeRuleIds, selectedRuleIds) {
  const picked = selectedRuleIds.has(rule.id) ? "●" : "○";
  const state = activeRuleIds.has(rule.id) ? "{green-fg}ÇALIŞIYOR{/}" : "{gray-fg}BEKLİYOR{/}";
  const enabled = rule.enabled ? "" : " {red-fg}[KAPALI]{/}";
  const chat = conversationTypeOf(rule) === "direct" ? "Birebir" : "Grup";
  const content = contentTypeOf(rule) === "text" ? "Metin" : "Gönderi";
  return `${picked} ${state}  ${platformLabel(rule)} · ${chat}: ${safeText(conversationNameOf(rule))} · @${safeText(rule.senderUsername)} · ${content} · ${rule.copiesPerTrigger} yanıt${enabled}`;
}

function confirmation(screen, question) {
  return new Promise((resolve) => {
    const overlay = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 64,
      height: 9,
      border: "line",
      label: " Onay ",
      tags: true,
      keys: true,
      mouse: true,
      style: { border: { fg: "yellow" }, bg: "black" },
    });
    blessed.text({
      parent: overlay,
      top: 1,
      left: 2,
      right: 2,
      height: 2,
      tags: true,
      content: safeText(question),
      align: "center",
    });
    const yes = blessed.button({
      parent: overlay,
      bottom: 1,
      left: 12,
      width: 15,
      height: 3,
      content: " Evet ",
      align: "center",
      valign: "middle",
      border: "line",
      keys: true,
      mouse: true,
      style: { focus: { bg: "green", fg: "black" }, hover: { bg: "green", fg: "black" } },
    });
    const no = blessed.button({
      parent: overlay,
      bottom: 1,
      right: 12,
      width: 15,
      height: 3,
      content: " Hayır ",
      align: "center",
      valign: "middle",
      border: "line",
      keys: true,
      mouse: true,
      style: { focus: { bg: "red", fg: "white" }, hover: { bg: "red", fg: "white" } },
    });
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      overlay.destroy();
      screen.render();
      resolve(answer);
    };
    yes.on("press", () => finish(true));
    no.on("press", () => finish(false));
    overlay.key(["y", "e"], () => finish(true));
    overlay.key(["n", "h", "escape"], () => finish(false));
    no.focus();
    screen.render();
  });
}

function createButton(screen, options, handler) {
  const button = blessed.button({
    parent: screen,
    bottom: 1,
    height: 3,
    border: "line",
    align: "center",
    valign: "middle",
    mouse: true,
    keys: true,
    shrink: false,
    style: {
      border: { fg: FENER_YELLOW },
      focus: { bg: FENER_YELLOW, fg: FENER_NAVY },
      hover: { bg: FENER_YELLOW, fg: FENER_NAVY },
    },
    ...options,
  });
  button.on("press", handler);
  return button;
}

async function runDashboard(store, options = {}) {
  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const screen = blessed.screen({
    input: options.input,
    output: options.output,
    smartCSR: true,
    fullUnicode: true,
    title: "Anti-Çado",
    mouse: true,
    dockBorders: true,
    autoPadding: true,
  });
  screen.enableMouse();

  const controller = options.controller || new AutomationController(store.profileDirectory);
  let config = await store.load();
  let activeRuleIds = controller.status().activeRuleIds;
  const selectedRuleIds = new Set();
  const logs = ["Panel hazır. Bir kuralı fareyle tıklayarak seçebilirsiniz."];
  let busy = false;
  let closing = false;
  let logoLayout = logoDimensions();
  logs.push("Fenerbahçe amblemi CLI karakterleriyle çiziliyor.");

  const headerBox = blessed.box({
    parent: screen,
    top: 0,
    left: 1,
    width: Math.max(20, screen.width - logoLayout.boxWidth - 3),
    height: 4,
    tags: true,
    content: "{bold}{yellow-fg}Anti-Çado{/}\n{gray-fg}Instagram ve X özel mesaj otomasyonu{/}",
  });

  const logoContent = `${renderCliEmblem()}\n{center}{white-fg}{bold}1907{/}{/center}`;
  const logoBox = blessed.box({
    parent: screen,
    top: 0,
    right: 1,
    width: logoLayout.boxWidth,
    height: logoLayout.boxHeight,
    border: "line",
    label: " FENERBAHÇE ",
    tags: true,
    content: logoContent,
    style: {
      bg: FENER_NAVY,
      border: { fg: FENER_YELLOW },
      label: { fg: FENER_YELLOW, bold: true },
    },
  });

  const statusBox = blessed.box({
    parent: screen,
    top: 4,
    left: 1,
    right: logoLayout.boxWidth + 2,
    height: 3,
    tags: true,
    border: "line",
  });
  const rulesList = blessed.list({
    parent: screen,
    top: 7,
    left: 1,
    right: logoLayout.boxWidth + 2,
    height: Math.max(5, logoLayout.logTop - 7),
    label: " Kurallar — tıkla/SPACE: seç ",
    border: "line",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " ", inverse: true },
    style: {
      selected: { bg: FENER_NAVY, fg: FENER_YELLOW },
      border: { fg: FENER_YELLOW },
    },
  });
  const logBox = blessed.log({
    parent: screen,
    top: logoLayout.logTop,
    left: 1,
    right: 1,
    bottom: 5,
    label: " Canlı Kayıt ",
    border: "line",
    tags: true,
    mouse: true,
    keys: true,
    scrollable: true,
    scrollbar: { ch: " ", inverse: true },
    style: { border: { fg: "gray" } },
  });
  blessed.text({
    parent: screen,
    bottom: 4,
    left: 1,
    right: 1,
    height: 1,
    tags: true,
    content: "{gray-fg}Fare veya ↑↓ · SPACE seç · B başlat · K durdur · D tümünü durdur · R yenile · M ayarlar · Q/ESC çıkış{/}",
  });

  function addLog(message) {
    logs.push(`[${new Date().toLocaleTimeString("tr-TR")}] ${safeText(message)}`);
    if (logs.length > 100) logs.shift();
    logBox.setContent(logs.join("\n"));
    logBox.setScrollPerc(100);
    screen.render();
  }

  function applyLogoLayout() {
    logoLayout = logoDimensions();
    headerBox.width = Math.max(20, screen.width - logoLayout.boxWidth - 3);
    logoBox.width = logoLayout.boxWidth;
    logoBox.height = logoLayout.boxHeight;
    statusBox.right = logoLayout.boxWidth + 2;
    rulesList.right = logoLayout.boxWidth + 2;
    rulesList.height = Math.max(5, logoLayout.logTop - 7);
    logBox.top = logoLayout.logTop;
  }

  function refreshView() {
    activeRuleIds = controller.status().activeRuleIds;
    const items = config.rules.length
      ? config.rules.map((rule) => ruleLine(rule, activeRuleIds, selectedRuleIds))
      : ["{gray-fg}Henüz kural yok. Kural Ayarları düğmesini kullanın.{/}"];
    const current = Math.max(0, Math.min(rulesList.selected || 0, items.length - 1));
    rulesList.setItems(items);
    if (config.rules.length) {
      rulesList.items.forEach((item) => {
        if (item._antiCadoClickBound) return;
        item._antiCadoClickBound = true;
        item.on("click", toggleCurrentRule);
      });
    }
    rulesList.select(current);
    statusBox.setContent(
      ` {green-fg}● ${activeRuleIds.size} çalışan{/}   {yellow-fg}● ${selectedRuleIds.size} seçili{/}   ● ${config.rules.length} toplam kural`,
    );
    screen.render();
  }

  function selectedRules(predicate = () => true) {
    let rules = config.rules.filter((rule) => selectedRuleIds.has(rule.id) && predicate(rule));
    if (!rules.length && config.rules[rulesList.selected] && predicate(config.rules[rulesList.selected])) {
      rules = [config.rules[rulesList.selected]];
    }
    return rules;
  }

  function toggleCurrentRule() {
    const rule = config.rules[rulesList.selected];
    if (!rule) return;
    if (selectedRuleIds.has(rule.id)) selectedRuleIds.delete(rule.id);
    else selectedRuleIds.add(rule.id);
    refreshView();
  }

  async function guarded(work) {
    if (busy || closing) return;
    busy = true;
    try {
      await work();
    } catch (error) {
      addLog(`HATA: ${error.message}`);
    } finally {
      busy = false;
      refreshView();
      rulesList.focus();
    }
  }

  async function startSelected() {
    await guarded(async () => {
      const rules = selectedRules((rule) => rule.enabled && !activeRuleIds.has(rule.id));
      if (!rules.length) return addLog("Başlatılabilecek seçili kural yok.");
      if (!(await confirmation(screen, `${rules.length} kural başlatılsın mı?`))) return addLog("Başlatma iptal edildi.");
      addLog("Chrome hazırlanıyor; seçili kurallar başlatılıyor...");
      await controller.startRules(rules);
    });
  }

  async function stopSelected() {
    await guarded(async () => {
      const rules = selectedRules((rule) => activeRuleIds.has(rule.id));
      if (!rules.length) return addLog("Durdurulabilecek seçili kural yok.");
      if (!(await confirmation(screen, `${rules.length} çalışan kural durdurulsun mu?`))) return addLog("Durdurma iptal edildi.");
      controller.stopRules(rules);
    });
  }

  async function stopEverything() {
    await guarded(async () => {
      if (!activeRuleIds.size) return addLog("Çalışan kural yok.");
      if (!(await confirmation(screen, "Çalışan tüm kurallar durdurulsun mu?"))) return addLog("Tümünü durdurma iptal edildi.");
      await controller.stopAll();
      addLog("Tüm kurallar durduruldu; Chrome kapatıldı.");
    });
  }

  async function reloadRules() {
    await guarded(async () => {
      config = await store.load();
      for (const id of [...selectedRuleIds]) {
        if (!config.rules.some((rule) => rule.id === id)) selectedRuleIds.delete(id);
      }
      addLog("Kurallar ayar dosyasından yenilendi.");
    });
  }

  const finish = (result) => {
    if (closing) return;
    closing = true;
    controller.stopAll().finally(() => {
      screen.destroy();
      options.onExit?.(result);
      resolveExit(result);
    });
  };

  async function requestFinish(result) {
    if (busy || closing) return;
    if (activeRuleIds.size && !(await confirmation(screen, "Çalışan kurallar durdurulup panel kapatılsın mı?"))) {
      addLog("Panel açık bırakıldı.");
      rulesList.focus();
      return;
    }
    finish(result);
  }

  createButton(screen, { left: "1%", width: "15%", content: "[B] Başlat" }, startSelected);
  createButton(screen, { left: "17%", width: "15%", content: "[K] Durdur" }, stopSelected);
  createButton(screen, { left: "33%", width: "18%", content: "[D] Tümünü durdur" }, stopEverything);
  createButton(screen, { left: "52%", width: "14%", content: "[R] Yenile" }, reloadRules);
  createButton(screen, { left: "67%", width: "20%", content: "[M] Kural ayarları" }, () => requestFinish("classic"));
  createButton(screen, { left: "88%", width: "11%", content: "[Q] Çıkış" }, () => requestFinish("exit"));

  logBox.setContent(logs.join("\n"));
  rulesList.key("enter", toggleCurrentRule);
  rulesList.key("space", toggleCurrentRule);
  screen.key(["b"], startSelected);
  screen.key(["k"], stopSelected);
  screen.key(["d"], stopEverything);
  screen.key(["r"], reloadRules);
  screen.key(["m"], () => requestFinish("classic"));
  screen.key(["q", "escape", "C-c"], () => requestFinish("exit"));
  controller.on("log", addLog);
  controller.on("status", refreshView);
  screen.on("resize", () => {
    applyLogoLayout();
    refreshView();
  });

  refreshView();
  rulesList.focus();
  options.onReady?.({
    close: () => finish("exit"),
    rulesList,
    screen,
    statusBox,
  });

  return exitPromise;
}

module.exports = {
  logoDimensions,
  renderCliEmblem,
  runDashboard,
};
