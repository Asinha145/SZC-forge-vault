/**
 * Manual-QA helper: loads the fixture and captures screenshots of the main
 * states (iso view, filter selection highlight, hide unselected, top view,
 * orthographic) into test/qa-screenshots/.
 *
 * Usage: node qa-screenshots.mjs
 */
import fs from "node:fs";
import { launchBrowser, loadModel, startServer, VIEWPORT } from "./helpers.mjs";

const OUT = "qa-screenshots";
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer(8179);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(server.url);
await loadModel(page);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-loaded-iso.png` });

await page.selectOption("#pset-select", "Bylor");
const prop = await page.locator("#prop-select option:nth-child(2)").getAttribute("value");
await page.selectOption("#prop-select", prop);
await page.locator("#value-list li").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/2-filter-selected.png` });

await page.click("#btn-hide-unselected");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/3-hide-unselected.png` });

await page.click("#btn-unhide-all");
await page.click("#btn-view-top");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/4-top-view.png` });

await page.click("#btn-projection");
await page.click("#btn-view-iso");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/5-ortho-iso.png` });

// SZC-ARMF tab
await page.evaluate(() => {
  const first = window.ifcModel.elements.keys().next().value;
  window.ifcModel.state.setSelection([first]);
});
await page.click('#tabs .tab[data-tab="SZC-ARMF"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/6-armf-tab.png` });

await browser.close();
server.stop();
console.log("Screenshots written to test/qa-screenshots/");
