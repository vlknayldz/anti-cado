"use strict";

const { REPEAT_MODES } = require("./rules");

class RuleRunner {
  constructor(sendCycle, options = {}) {
    this.sendCycle = sendCycle;
    this.log = options.log || (() => {});
    this.states = new Map();
    this.stopped = false;
  }

  handle(rule, event) {
    if (this.stopped || !rule.enabled) return;
    const state = this.states.get(rule.id) || {
      generation: 0,
      processedCount: 0,
      seenEvents: new Set(),
      queue: Promise.resolve(),
    };
    this.states.set(rule.id, state);

    const eventKey = String(event.signature || event.marker || "").trim();
    if (!eventKey || state.seenEvents.has(eventKey)) return;

    const limit =
      rule.repeatMode === REPEAT_MODES.UNTIL_STOPPED
        ? Number.POSITIVE_INFINITY
        : Number(rule.repeatCount || 1);
    if (state.processedCount >= limit) return;

    state.seenEvents.add(eventKey);
    state.processedCount += 1;
    const generation = state.generation;

    state.queue = state.queue
      .then(async () => {
        if (this.stopped || state.generation !== generation) return;
        await this.sendCycle(rule, event);
      })
      .catch((error) => this.log(`Kural çalıştırılamadı: ${error.message}`));
  }

  stopRule(ruleId) {
    const state = this.states.get(ruleId);
    if (state) state.generation += 1;
  }

  resetRule(ruleId) {
    const state = this.states.get(ruleId);
    if (state) state.generation += 1;
    this.states.set(ruleId, {
      generation: 0,
      processedCount: 0,
      seenEvents: new Set(),
      queue: Promise.resolve(),
    });
  }

  stopAll() {
    this.stopped = true;
    for (const state of this.states.values()) state.generation += 1;
  }
}

module.exports = { RuleRunner };
