#!/usr/bin/env node
"use strict";

const { stdout } = require("node:process");
const { ConfigStore } = require("./config-store");
const { InstagramSession } = require("./instagram");
const { Prompts, isBackNavigation } = require("./prompts");
const { RuleRunner } = require("./rule-runner");
const {
  PLATFORMS,
  compactRuleSummary,
  conversationNameOf,
  conversationTypeOf,
  ruleSummary,
} = require("./rules");

const store = new ConfigStore();

function printRules(rules) {
  if (!rules.length) {
    stdout.write("\nHenüz kural eklenmemiş.\n");
    return;
  }
  rules.forEach((rule, index) => {
    stdout.write(`\n[${index + 1}] ${rule.enabled ? "AÇIK" : "KAPALI"}\n${ruleSummary(rule)}\n`);
  });
}

async function login(prompts) {
  let platform;
  try {
    const selected = await prompts.choose(
      "Hangi hesaba giriş yapılacak?",
      ["Instagram", "X/Twitter"],
    );
    platform = selected === 1 ? PLATFORMS.X : PLATFORMS.INSTAGRAM;
  } catch (error) {
    if (isBackNavigation(error)) return;
    throw error;
  }
  const platformLabel = platform === PLATFORMS.X ? "X/Twitter" : "Instagram";
  const session = new InstagramSession(store.profileDirectory);
  try {
    const page = await session.login(platform);
    stdout.write(`\nAçılan pencerede ${platformLabel} hesabına giriş yapın. Parolanız uygulamaya kaydedilmez.\n`);
    try {
      await prompts.text("Giriş tamamlanınca buraya TAMAM yazın", "TAMAM");
    } catch (error) {
      if (isBackNavigation(error)) {
        stdout.write(`${platformLabel} girişi iptal edildi.\n`);
        return;
      }
      throw error;
    }
    await page.goto(
      platform === PLATFORMS.X
        ? "https://x.com/i/chat"
        : "https://www.instagram.com/direct/inbox/",
      {
      waitUntil: "domcontentloaded",
      },
    );
    await session.assertLoggedIn(page, platform);
    stdout.write(`${platformLabel} oturumu hazır.\n`);
  } finally {
    await session.close();
  }
}

function ruleChoiceLabel(rule) {
  return `${rule.platform === PLATFORMS.X ? "X" : "Instagram"} | ${conversationTypeOf(rule) === "direct" ? "Birebir" : "Grup"}: ${conversationNameOf(rule)} — @${rule.senderUsername}`;
}

async function selectRules(prompts, rules, action) {
  if (!rules.length) return [];
  try {
    const indexes = await prompts.multiSelect(
      `${action} için kuralları seçin:`,
      rules.map(ruleChoiceLabel),
    );
    return indexes.map((index) => rules[index]);
  } catch (error) {
    if (isBackNavigation(error)) return [];
    throw error;
  }
}

async function confirmRuleAction(prompts, action, rules) {
  if (!rules.length) return false;
  stdout.write(`\n${action} kurallar:\n`);
  rules.forEach((rule, index) => stdout.write(`${index + 1}) ${ruleChoiceLabel(rule)}\n`));
  try {
    return await prompts.confirm(
      `${rules.length} kural için ${action.toLocaleLowerCase("tr-TR")} onaylansın mı?`,
      false,
    );
  } catch (error) {
    if (isBackNavigation(error)) return false;
    throw error;
  }
}

function printRuntimeRuleStatus(rules, activeRuleIds) {
  stdout.write("\n--- Çalışma Durumu ---\n");
  rules.forEach((rule, index) => {
    const state = activeRuleIds.has(rule.id) ? "ÇALIŞIYOR" : "BEKLİYOR";
    stdout.write(`${index + 1}) [${state}] ${ruleChoiceLabel(rule)}\n`);
  });
}

async function startAutomation(config, stopPrompts = null, initialRules = null) {
  const enabledRules = config.rules.filter((rule) => rule.enabled);
  if (!enabledRules.length) throw new Error("Çalıştırılacak açık kural yok.");
  const startingRules = (initialRules || enabledRules).filter((rule) => rule.enabled);
  if (!startingRules.length) throw new Error("Başlatılacak kural seçilmedi.");

  const session = new InstagramSession(store.profileDirectory, {
    log: (message) => stdout.write(`${message}\n`),
  });
  const runner = new RuleRunner(
    (rule, event) => session.queueSend(rule, event),
    { log: (message) => stdout.write(`${message}\n`) },
  );
  const activeRuleIds = new Set();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stdout.write("\nOtomasyon durduruluyor...\n");
    runner.stopAll();
    await session.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    startingRules.forEach((rule) => {
      runner.resetRule(rule.id);
      session.activateRule(rule.id);
    });
    await session.openConversations(startingRules);
    startingRules.forEach((rule) => activeRuleIds.add(rule.id));
    session.startPolling((rule, event) => {
      if (!activeRuleIds.has(rule.id)) return;
      stdout.write(
        `Yeni mesaj: [${event.conversationName}] @${event.username} — ${event.preview || "[medya]"}\n`,
      );
      runner.handle(rule, event);
    });
    if (stopPrompts) {
      stdout.write(`\nOtomasyon çalışıyor: ${activeRuleIds.size} kural aktif.\n`);
      while (!shuttingDown) {
        printRuntimeRuleStatus(enabledRules, activeRuleIds);
        const command = await stopPrompts.waitForAutomationCommand();

        if (command === "start_rule") {
          const availableRules = enabledRules.filter((rule) => !activeRuleIds.has(rule.id));
          if (!availableRules.length) {
            stdout.write("Başlatılmayı bekleyen açık kural yok.\n");
            continue;
          }
          const selected = await selectRules(stopPrompts, availableRules, "Başlatma");
          if (!(await confirmRuleAction(stopPrompts, "Başlatma", selected))) {
            stdout.write("Kural başlatma iptal edildi.\n");
            continue;
          }
          for (const rule of selected) {
            try {
              await session.addRules([rule]);
              runner.resetRule(rule.id);
              session.activateRule(rule.id);
              activeRuleIds.add(rule.id);
              stdout.write(`Başlatıldı: ${ruleChoiceLabel(rule)}\n`);
            } catch (error) {
              stdout.write(`Kural başlatılamadı: ${ruleChoiceLabel(rule)} — ${error.message}\n`);
            }
          }
          stdout.write(`Aktif kural sayısı: ${activeRuleIds.size}\n`);
          continue;
        }

        if (command === "stop_rule") {
          const activeRules = enabledRules.filter((rule) => activeRuleIds.has(rule.id));
          if (!activeRules.length) {
            stdout.write("Durdurulacak çalışan kural yok. B ile bir kural başlatabilirsiniz.\n");
            continue;
          }
          const selected = await selectRules(stopPrompts, activeRules, "Durdurma");
          if (!(await confirmRuleAction(stopPrompts, "Durdurma", selected))) {
            stdout.write("Kural durdurma iptal edildi.\n");
            continue;
          }
          selected.forEach((rule) => {
            activeRuleIds.delete(rule.id);
            runner.stopRule(rule.id);
            session.cancelRule(rule.id);
            stdout.write(`Durduruldu: ${ruleChoiceLabel(rule)}\n`);
          });
          stdout.write(`Aktif kural sayısı: ${activeRuleIds.size}\n`);
          continue;
        }

        let confirmed = false;
        try {
          confirmed = await stopPrompts.confirm(
            "Otomasyon gerçekten durdurulsun mu?",
            false,
          );
        } catch (error) {
          if (!isBackNavigation(error)) throw error;
        }
        if (confirmed) break;
        stdout.write("Durdurma iptal edildi; otomasyon çalışmaya devam ediyor.\n");
      }
      await shutdown();
    } else {
      stdout.write("\nOtomasyon çalışıyor. Durdurmak için Ctrl+C tuşlarına basın.\n");
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    }
  } finally {
    runner.stopAll();
    await session.close();
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
  }
}

async function selectRule(prompts, rules, action) {
  if (!rules.length) {
    stdout.write("Henüz kural yok.\n");
    return -1;
  }
  try {
    return await prompts.choose(
      `${action} için kural seçin:`,
      rules.map(ruleChoiceLabel),
    );
  } catch (error) {
    if (isBackNavigation(error)) return -1;
    throw error;
  }
}

async function interactiveMenu() {
  const prompts = new Prompts();
  try {
    while (true) {
      const config = await store.load();
      stdout.write("\n=== Anti-Çado ===\n");
      const ruleFooter = [
        "--- Kural Özeti ---",
        ...(config.rules.length
          ? config.rules.map((rule, index) => compactRuleSummary(rule, index))
          : ["Henüz kural yok."]),
      ];
      let choice;
      try {
        choice = await prompts.choose(
          "Ne yapmak istiyorsunuz?",
          [
            "Otomasyonu başlat",
            "Yeni kural ekle",
            "Kuralları göster",
            "Kuralı düzenle",
            "Kuralı aç veya kapat",
            "Kuralı sil",
            "Hesap girişi yap (Instagram / X)",
            "Çıkış",
          ],
          0,
          ruleFooter,
          "çıkış",
        );
      } catch (error) {
        if (isBackNavigation(error)) return;
        throw error;
      }

      try {
        if (choice === 0) {
          const availableRules = config.rules.filter((rule) => rule.enabled);
          if (!availableRules.length) {
            stdout.write("Başlatılabilecek açık kural yok.\n");
            continue;
          }
          const selected = await selectRules(prompts, availableRules, "Başlatma");
          if (await confirmRuleAction(prompts, "Başlatma", selected)) {
            await startAutomation(config, prompts, selected);
          } else if (selected.length) {
            stdout.write("Başlatma iptal edildi.\n");
          }
        }
        if (choice === 1) {
          const rule = await prompts.ruleWizard();
          if (rule) {
            config.rules.push(rule);
            await store.save(config);
            stdout.write("Kural kaydedildi.\n");
          }
        }
        if (choice === 2) printRules(config.rules);
        if (choice === 3) {
          const index = await selectRule(prompts, config.rules, "Düzenleme");
          if (index >= 0) {
            const updated = await prompts.ruleEditor(config.rules[index]);
            if (updated) {
              config.rules[index] = updated;
              await store.save(config);
              stdout.write("Kural güncellendi.\n");
            }
          }
        }
        if (choice === 4) {
          const index = await selectRule(prompts, config.rules, "Açma/kapatma");
          if (index >= 0) {
            config.rules[index].enabled = !config.rules[index].enabled;
            await store.save(config);
            stdout.write(`Kural ${config.rules[index].enabled ? "açıldı" : "kapatıldı"}.\n`);
          }
        }
        if (choice === 5) {
          const index = await selectRule(prompts, config.rules, "Silme");
          if (index >= 0 && (await prompts.confirm("Bu kural silinsin mi?", false))) {
            config.rules.splice(index, 1);
            await store.save(config);
            stdout.write("Kural silindi.\n");
          }
        }
        if (choice === 6) await login(prompts);
        if (choice === 7) return;
      } catch (error) {
        if (isBackNavigation(error)) {
          stdout.write("Ana menüye dönüldü.\n");
          continue;
        }
        throw error;
      }
    }
  } finally {
    prompts.close();
  }
}

async function main() {
  stdout.write("\u001b]0;Anti-Çado\u0007");
  const command = process.argv[2] || "menu";
  const config = await store.load();
  if (command === "menu") {
    const { runDashboard } = require("./tui");
    const result = await runDashboard(store);
    if (result === "classic") return interactiveMenu();
    return;
  }
  if (command === "classic") return interactiveMenu();
  if (command === "start") return startAutomation(config);
  if (command === "list") return printRules(config.rules);
  if (command === "login") {
    const prompts = new Prompts();
    try {
      return await login(prompts);
    } finally {
      prompts.close();
    }
  }
  stdout.write("Kullanım: anticado [menu|classic|start|list|login]\n");
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`\nHata: ${error.message}\n`);
  process.exitCode = 1;
});
