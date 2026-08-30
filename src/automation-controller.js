"use strict";

const { EventEmitter } = require("node:events");
const { InstagramSession } = require("./instagram");
const { RuleRunner } = require("./rule-runner");

class AutomationController extends EventEmitter {
  constructor(profileDirectory, options = {}) {
    super();
    this.profileDirectory = profileDirectory;
    this.SessionClass = options.SessionClass || InstagramSession;
    this.RunnerClass = options.RunnerClass || RuleRunner;
    this.session = null;
    this.runner = null;
    this.polling = false;
    this.activeRuleIds = new Set();
  }

  ensureEngine() {
    if (this.session && this.runner) return;
    this.session = new this.SessionClass(this.profileDirectory, {
      log: (message) => this.emit("log", message),
    });
    this.runner = new this.RunnerClass(
      (rule, event) => this.session.queueSend(rule, event),
      { log: (message) => this.emit("log", message) },
    );
  }

  async startRules(rules) {
    this.ensureEngine();
    const results = [];
    for (const rule of rules.filter((candidate) => candidate.enabled)) {
      if (this.activeRuleIds.has(rule.id)) continue;
      try {
        await this.session.addRules([rule]);
        this.runner.resetRule(rule.id);
        this.session.activateRule(rule.id);
        this.activeRuleIds.add(rule.id);
        results.push({ rule, ok: true });
        this.emit("log", `Başlatıldı: ${rule.conversationName} — @${rule.senderUsername}`);
      } catch (error) {
        results.push({ rule, ok: false, error });
        this.emit("log", `Başlatılamadı: ${rule.conversationName} — ${error.message}`);
      }
    }

    if (!this.polling && this.activeRuleIds.size) {
      this.session.startPolling((rule, event) => {
        if (!this.activeRuleIds.has(rule.id)) return;
        this.emit("message", { rule, event });
        this.emit(
          "log",
          `Yeni mesaj: ${event.conversationName} — @${event.username} — ${event.preview || "[medya]"}`,
        );
        this.runner.handle(rule, event);
      });
      this.polling = true;
    }
    this.emit("status", this.status());
    return results;
  }

  stopRules(rules) {
    if (!this.session || !this.runner) return;
    for (const rule of rules) {
      if (!this.activeRuleIds.delete(rule.id)) continue;
      this.runner.stopRule(rule.id);
      this.session.cancelRule(rule.id);
      this.emit("log", `Durduruldu: ${rule.conversationName} — @${rule.senderUsername}`);
    }
    this.emit("status", this.status());
  }

  async stopAll() {
    if (this.runner) this.runner.stopAll();
    for (const ruleId of this.activeRuleIds) this.session?.cancelRule(ruleId);
    this.activeRuleIds.clear();
    await this.session?.close();
    this.session = null;
    this.runner = null;
    this.polling = false;
    this.emit("status", this.status());
  }

  status() {
    return { activeRuleIds: new Set(this.activeRuleIds) };
  }
}

module.exports = { AutomationController };
