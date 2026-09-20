import assert from "node:assert/strict";
const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
const { default: worker } = await import(workerUrl.href);
const response = await worker.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
const html = await response.text();
console.log("status", response.status, "length", html.length);
console.log("has school-workspace:", html.includes("school-workspace"));
console.log("has subject-card:", html.includes("subject-card"));
console.log("has Go deeper:", html.includes("Go deeper"));
console.log("has Subjects tab:", html.includes("Subjects"));
