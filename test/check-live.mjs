// One-off check that the deployed GitHub Pages site loads the fixture IFC.
import { chromium } from "@playwright/test";

const FIXTURE = "C:\\Users\\ASinha\\OneDrive - Laing ORourke\\Documents\\SWC\\Job\\Solving Dataset\\2hwx0208ac1_run\\input\\2HWX0208AC1.ifc";
const URL = process.argv[2] ?? "https://asinha145.github.io/szc-ifc-viewer/";

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL);
await page.setInputFiles("#file-input", FIXTURE);
await page.waitForFunction(() => window.ifcModel?.elements.size > 0, null, { timeout: 60000 });
console.log("LIVE OK — elements:", await page.evaluate(() => window.ifcModel.elements.size),
  "| psets:", await page.evaluate(() => window.ifcModel.filterIndex.size),
  "| console errors:", errors.length ? errors : "none");
await page.waitForTimeout(800);
await page.screenshot({ path: "qa-screenshots/7-live-site.png" });
await browser.close();
