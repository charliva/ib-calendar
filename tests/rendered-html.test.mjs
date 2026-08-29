import assert from "node:assert/strict";
import test from "node:test";

async function render(url = "http://localhost/calendar") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(url, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Syllabi calendar", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Syllabi/);
  assert.match(html, /Flexible work/);
  assert.match(html, /Unscheduled/);
  assert.match(html, /Create or transform/);
  assert.match(html, /Temporal zoom/);
  assert.match(html, /Attention home/);
  assert.match(html, /Tell Syllabi what you need/);
  assert.match(html, /This time can stay free/);
  assert.match(html, /Intentions/);
  assert.match(html, /Tasks and intentions wait here/);
  assert.doesNotMatch(html, /Calculus problem set/);
  assert.doesNotMatch(html, /Review electric fields/);
  assert.doesNotMatch(html, /Biology revision/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("redirects the legacy root to the calendar route", async () => {
  const response = await render("http://localhost/");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/calendar");
});
