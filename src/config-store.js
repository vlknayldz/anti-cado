"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRule } = require("./rules");

function defaultDataDirectory() {
  if (process.env.IG_GRUP_DATA_DIR) return path.resolve(process.env.IG_GRUP_DATA_DIR);
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const antiCadoDirectory = path.join(base, "Anti-Çado");
  const anticadoDirectory = path.join(base, "Anticado");
  const legacyDirectory = path.join(base, "InstagramGrupYanitlayici");
  const antiCadoConfig = path.join(antiCadoDirectory, "config.json");
  const anticadoConfig = path.join(anticadoDirectory, "config.json");
  const legacyConfig = path.join(legacyDirectory, "config.json");
  if (fsSync.existsSync(antiCadoConfig)) return antiCadoDirectory;
  if (!fsSync.existsSync(anticadoConfig) && fsSync.existsSync(legacyConfig)) {
    return legacyDirectory;
  }
  if (fsSync.existsSync(anticadoConfig)) return anticadoDirectory;
  return antiCadoDirectory;
}

class ConfigStore {
  constructor(dataDirectory = defaultDataDirectory()) {
    this.dataDirectory = dataDirectory;
    this.configPath = path.join(dataDirectory, "config.json");
    this.profileDirectory = path.join(dataDirectory, "browser-profile");
  }

  async load() {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.configPath, "utf8"));
      return {
        version: 3,
        rules: Array.isArray(parsed.rules)
          ? parsed.rules.map((rule) =>
              createRule({
                ...rule,
                repeatIntervalSeconds:
                  Number(rule.copiesPerTrigger) > 1 &&
                  Number(rule.repeatIntervalSeconds) < 1
                    ? 1
                    : rule.repeatIntervalSeconds,
              }),
            )
          : [],
      };
    } catch (error) {
      if (error.code === "ENOENT") return { version: 3, rules: [] };
      throw new Error(`Ayar dosyası okunamadı: ${error.message}`);
    }
  }

  async save(config) {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.configPath}.tmp-${process.pid}`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await fs.rename(temporaryPath, this.configPath);
  }
}

module.exports = { ConfigStore, defaultDataDirectory };
