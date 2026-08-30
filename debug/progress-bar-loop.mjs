import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(decodeURIComponent(new URL("..", import.meta.url).pathname), "dist/client");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  const path = request.url?.split("?")[0] ?? "/";
  if (path === "/") {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url).href;
    const { default: worker } = await import(workerUrl);
    const workerResponse = await worker.fetch(
      new Request("http://localhost" + request.url, {
        headers: { accept: "text/html" },
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers));
    response.end(await workerResponse.text());
    return;
  }

  const file = join(DIST, path);
  if (!existsSync(file)) {
    console.log("[static miss]", path, file);
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(4175, resolve));
mkdirSync("/tmp/ib-debug", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => {
  if (message.text().includes("[DEBUG-progress]")) console.log(message.text());
});
page.on("console", (message) => {
  if (message.type() === "error") console.log("[browser error]", message.text());
});
page.on("pageerror", (error) => console.log("[page error]", error.message));
page.on("requestfailed", (request) =>
  console.log("[request failed]", request.url(), request.failure()?.errorText),
);
await page.goto("http://localhost:4175/", { waitUntil: "load", timeout: 30_000 });
await page.waitForTimeout(5000);
console.log(
  "initial",
  await page.evaluate(() => ({
    title: document.title,
    buttons: [...document.querySelectorAll("button")].slice(0, 30).map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim()),
  })),
);
await page.locator('button[aria-label="School"]').click();
await page.waitForTimeout(3000);
console.log(
  "school",
  await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")].slice(0, 30).map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim()),
  })),
);
await page.locator('button:has-text("Assignments")').first().click();
await page.waitForTimeout(1000);

const before = await page.evaluate(() => {
  const fill = document.querySelector(".assignment-progress > div > span");
  const track = document.querySelector(".assignment-progress > div");
  return {
    assignmentCount: document.querySelectorAll(".assignment-record").length,
    fillStyle: fill?.getAttribute("style") ?? null,
    trackWidth: track?.getBoundingClientRect().width ?? null,
    fillWidth: fill?.getBoundingClientRect().width ?? null,
  };
});
console.log(JSON.stringify({ before }, null, 2));
await page.screenshot({ path: "/tmp/ib-debug/assignments-before.png", fullPage: true });

await page.locator('button:has-text("Add assignment")').click();
await page.locator('input[placeholder="Biology lab report"]').fill("Progress repro");
await page.locator('input[placeholder="e.g. tomorrow at 2 pm"]').fill("tomorrow at 4 pm");
await page.locator('button:has-text("Save")').last().click();
await page.waitForTimeout(1000);

const created = await page.evaluate(() => ({
  assignmentCount: document.querySelectorAll(".assignment-record").length,
  fillStyle: document.querySelector(".assignment-progress > div > span")?.getAttribute("style") ?? null,
}));
console.log(JSON.stringify({ created }, null, 2));

await page.locator('button[title="Add an unscheduled work session"]').click();
await page.waitForTimeout(1000);
const checkbox = page.locator('.assignment-sessions [role="checkbox"]').first();
await checkbox.waitFor({ timeout: 5000 });
await checkbox.click();
await page.waitForTimeout(2000);

const after = await page.evaluate(() => {
  const fill = document.querySelector(".assignment-progress > div > span");
  const track = document.querySelector(".assignment-progress > div");
  const label = document.querySelector(".assignment-progress small");
  return {
    label: label?.textContent ?? null,
    fillStyle: fill?.getAttribute("style") ?? null,
    trackWidth: track?.getBoundingClientRect().width ?? null,
    fillWidth: fill?.getBoundingClientRect().width ?? null,
    checked: document.querySelector('.assignment-sessions [role="checkbox"]')?.getAttribute("aria-checked") ?? null,
  };
});
console.log(JSON.stringify({ after }, null, 2));
await page.screenshot({ path: "/tmp/ib-debug/progress-after-complete.png", fullPage: true });

const widthPercentage = Number(after.fillStyle?.match(/width:\s*([\d.]+)%/)?.[1] ?? "0");
const isRed = widthPercentage > 0 && after.fillWidth === 0;
console.log(isRed ? "RED: completed progress is invisible" : "GREEN: completed progress renders");
process.exitCode = isRed ? 1 : 0;

await browser.close();
server.close();
