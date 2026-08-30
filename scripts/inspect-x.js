"use strict";

const { InstagramSession } = require("../src/instagram");
const { ConfigStore } = require("../src/config-store");
const { PLATFORMS } = require("../src/rules");

(async () => {
  const store = new ConfigStore();
  const session = new InstagramSession(store.profileDirectory, { log: () => {} });
  try {
    const page = await session.login(PLATFORMS.X);
    await page.waitForTimeout(3000);
    await session.assertLoggedIn(page, PLATFORMS.X);
    const testIds = await page.locator("[data-testid]").evaluateAll((elements) => {
      const counts = {};
      for (const element of elements) {
        const key = element.getAttribute("data-testid");
        counts[key] = (counts[key] || 0) + 1;
      }
      return Object.entries(counts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 50);
    });
    const messageLinkPatterns = await page
      .locator('a[href*="/messages/"]')
      .evaluateAll((elements) =>
        [...new Set(
          elements
            .map((element) => element.getAttribute("href"))
            .filter(Boolean)
            .map((href) => href.replace(/\/messages\/[^/?#]+/, "/messages/:id")),
        )].slice(0, 20),
      );
    const structure = await page.evaluate(() => {
      const describe = (element) =>
        element
          ? {
              tag: element.tagName,
              role: element.getAttribute("role"),
              testid: element.getAttribute("data-testid"),
              type: element.getAttribute("type"),
              placeholder: element.getAttribute("placeholder"),
              contenteditable: element.getAttribute("contenteditable"),
            }
          : null;
      const search = document.querySelector('[data-testid="dm-search-bar"]');
      const item = document.querySelector('[data-testid^="dm-conversation-item-"]');
      return {
        search: describe(search),
        searchChildren: search ? [...search.querySelectorAll("input, [role], [data-testid]")].map(describe) : [],
        conversationItem: describe(item),
        conversationChildren: item
          ? [...item.querySelectorAll("[role], [data-testid]")].map(describe).slice(0, 30)
          : [],
      };
    });
    const searchBar = page.locator('[data-testid="dm-search-bar"]');
    let searchOpenStructure = null;
    if (await searchBar.isVisible().catch(() => false)) {
      await searchBar.click();
      await page.waitForTimeout(500);
      searchOpenStructure = await page.evaluate(() =>
        [...document.querySelectorAll("input, [contenteditable=true], [role=searchbox]")].map(
          (element) => ({
            tag: element.tagName,
            role: element.getAttribute("role"),
            testid: element.getAttribute("data-testid"),
            type: element.getAttribute("type"),
            placeholder: element.getAttribute("placeholder"),
          }),
        ),
      );
    }
    console.log(`URL=${page.url()}`);
    console.log(`WEBDRIVER=${await page.evaluate(() => navigator.webdriver)}`);
    console.log(`TESTIDS=${JSON.stringify(testIds)}`);
    console.log(`DM_LINK_PATTERNS=${JSON.stringify(messageLinkPatterns)}`);
    console.log(`STRUCTURE=${JSON.stringify(structure)}`);
    console.log(`SEARCH_OPEN=${JSON.stringify(searchOpenStructure)}`);
  } finally {
    await session.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
