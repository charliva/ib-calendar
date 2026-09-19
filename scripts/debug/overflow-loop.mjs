import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = new URL("../../dist/client", import.meta.url).pathname;
const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  let file = join(DIST, p === "/" ? "index.html" : p);
  if (!existsSync(file)) {
    // try RSC-style path fallback: /index.html
    const alt = join(DIST, "index.html");
    if (existsSync(alt)) file = alt;
 p = "/index.html";
  }
  if (!existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
  const body = readFileSync(file);
  res.writeHead(200, {"content-type": MIME[extname(file)] ?? "application/octet-stream"});
  res.end(body);
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });

// Navigate to School workspace: click the graduation-cap icon in the rail
const schoolBtn = page.locator('button[aria-label="School"]').first();
const found = await schoolBtn.count().catch(() => 0);
if (found > 0) {
  await schoolBtn.first().click();
} else {
  // fall back: click the 3rd rail button
  await page.waitForTimeout(1000); await page.locator('nav[aria-label="Calendar tools"] button[aria-label="School"]').click();
}
await page.waitForTimeout(600)

// Click Subjects tab
const tab = page.locator('button:has-text("Subjects")').first();
if (await tab.count()) await tab.click();
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".subject-card")];
  const out = { cardCount: cards.length, overflow: [] };
  for (const card of cards) {
    const cardRect = card.getBoundingClientRect();
    const controls = card.querySelector(".learning-controls");
    if (!controls) continue;
    const controlsRect = controls.getBoundingClientRect();
    const overflowsRight = controlsRect.right > cardRect.right + 1;
    const goDeeper = controls.querySelector(".go-deeper-button");
    const gdRect = goDeeper?.getBoundingClientRect();
    out.overflow.push({
      card: card.querySelector("strong")?.textContent,
      cardWidth: Math.round(cardRect.width),
      controlsRight: Math.round(controlsRect.right),
      cardRight: Math.round(cardRect.right),
      goDeeperRight: gdRect ? Math.round(gdRect.right) : null,
      goDeeperClipped: card.querySelector(".go-deeper-button")?.scrollWidth > (goDeeper?.clientWidth ?? 0) + 2,
      overflowRight: overflowsRight,
    });
  }
  return out;
});
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: "/tmp/ib-debug/school-subjects.png", fullPage: false });

const red = result.overflow.some(o => o.overflowRight || o.goDeeperClipped);
console.log(red ? "RED: overflow detected" : "GREEN: no overflow");
await browser.close();
server.close();
process.exit(red ? 1 : 0);
