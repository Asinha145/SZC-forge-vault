/**
 * Shared test infrastructure: fixture path, browser launch options, the
 * model-load wait, and a static-server starter with a real readiness probe.
 * Single source of truth for smoke.spec.mjs, qa-screenshots.mjs and
 * check-live.mjs so the contracts can't drift between them.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE = "C:\\Users\\ASinha\\OneDrive - Laing ORourke\\Documents\\SWC\\Job\\Solving Dataset\\2hwx0208ac1_run\\input\\2HWX0208AC1.ifc";

export const VIEWPORT = { width: 1400, height: 900 };

// SwiftShader flag: headless Edge has no GPU here; software WebGL needs it.
export const BROWSER_OPTIONS = {
  channel: "msedge",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
};

export function launchBrowser() {
  return chromium.launch(BROWSER_OPTIONS);
}

/** Uploads the fixture and waits until the app reports a parsed model. */
export async function loadModel(page, fixture = FIXTURE) {
  await page.setInputFiles("#file-input", fixture);
  await page.waitForFunction(
    () => window.ifcModel && window.ifcModel.elements.size > 0,
    null,
    { timeout: 90_000 },
  );
}

/** Starts serve.mjs on the port and resolves once it actually responds. */
export async function startServer(port) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const proc = spawn("node", [path.join(dir, "serve.mjs"), String(port)], { stdio: "ignore" });
  const url = `http://localhost:${port}/`;
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`Static server did not become ready at ${url}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { url, stop: () => proc.kill() };
}
