import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const repoRoot = decodeURIComponent(new URL("..", import.meta.url).pathname);
const DIST = join(repoRoot, "dist/client");
const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json",".woff2":"font/woff2"};
const server = createServer(async (req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url).href;
    const { default: worker } = await import(workerUrl);
    const workerRes = await worker.fetch(
      new Request("http://localhost" + req.url, { headers: { "accept": "text/html" } }),
      { ASSETS: { fetch: async () => new Response("nf", {status:404}) } },
      { waitUntil(){}, passThroughOnException(){} }
    );
    res.writeHead(workerRes.status, Object.fromEntries(workerRes.headers));
    res.end(await workerRes.text());
    return;
  }
  let file = join(DIST, p);
  if (!existsSync(file)) { res.writeHead(404); res.end("nf " + p); return; }
  res.writeHead(200, {"content-type": MIME[extname(file)] ?? "application/octet-stream"});
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(4174, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:4174/", { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(4000);

// Click the School rail button
await page.locator('button[aria-label="School"]').click();
await page.waitForTimeout(1500);
const afterSchool = await page.evaluate(() => ({
  subjectCards: document.querySelectorAll(".subject-card").length,
  challengeDials: document.querySelectorAll(".challenge-dial").length,
  goDeeperButtons: document.querySelectorAll(".go-deeper-button").length,
  headings: [...document.querySelectorAll("h1,h2")].slice(0,4).map(h => h.textContent.trim()),
}));
console.log("after school click:", JSON.stringify(afterSchool));

// Click the Subjects tab
const subjectsTab = page.locator('button:has-text("Subjects")').first();
if (await subjectsTab.count()) {
  await subjectsTab.click();
  await page.waitForTimeout(1000);
}
const afterSubjects = await page.evaluate(() => ({
  subjectCards: document.querySelectorAll(".subject-card").length,
  challengeDials: document.querySelectorAll(".challenge-dial").length,
  goDeeperButtons: document.querySelectorAll(".go-deeper-button").length,
  headings: [...document.querySelectorAll("h1,h2")].slice(0,4).map(h => h.textContent.trim()),
}));
console.log("after subjects click:", JSON.stringify(afterSubjects));

await browser.close(); server.close();
