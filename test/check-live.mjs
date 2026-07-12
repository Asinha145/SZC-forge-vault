// One-off check that the deployed GitHub Pages site loads the fixture IFC.
import { launchBrowser, loadModel, VIEWPORT } from "./helpers.mjs";

const URL = process.argv[2] ?? "https://asinha145.github.io/SZC-forge-vault/";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL);
await loadModel(page);
console.log("LIVE OK — elements:", await page.evaluate(() => window.ifcModel.elements.size),
  "| psets:", await page.evaluate(() => window.ifcModel.filterIndex.size),
  "| console errors:", errors.length ? errors : "none");
await page.waitForTimeout(800);
await page.screenshot({ path: "qa-screenshots/7-live-site.png" });
await browser.close();
