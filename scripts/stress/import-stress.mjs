import { readFileSync } from "node:fs";

const TARGET = process.env.TARGET_URL || "http://localhost:3000/api/extract";
const USERS = parseInt(process.env.USERS || "100", 10);
const ROUNDS = parseInt(process.env.ROUNDS || "1", 10);

// Build a small PNG so the payload is realistic
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const results = [];
const errors = [];

async function simulateUser(userId) {
  const boundary = `----formdata-${userId}-${Date.now()}`;
  const parts = [];

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="user-${userId}-screenshot.png"\r\nContent-Type: image/png\r\n\r\n`,
  );

  const header = Buffer.from(parts.join(""));
  const body = Buffer.concat([header, PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const start = performance.now();

  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const latency = performance.now() - start;
    results.push({ userId, latency, status: res.status });
  } catch (err) {
    const latency = performance.now() - start;
    errors.push({ userId, latency, error: err.message });
  }
}

console.log(`Target: ${TARGET}`);
console.log(`Users: ${USERS} concurrent\n`);

const overallStart = performance.now();

await Promise.allSettled(
  Array.from({ length: USERS }, (_, i) => simulateUser(i)),
);

const overall = performance.now() - overallStart;

const latencies = results.map(r => r.latency).sort((a, b) => a - b);
const p = (n) => latencies[Math.floor(n * latencies.length)] || 0;

console.log(`Requests sent:      ${USERS}`);
console.log(`Errors:             ${errors.length}`);
console.log(`Overall wall time:  ${overall.toFixed(0)}ms`);
console.log(`\nLatency percentiles (ms):`);
console.log(`  p50: ${p(0.50).toFixed(0)}`);
console.log(`  p90: ${p(0.90).toFixed(0)}`);
console.log(`  p99: ${p(0.99).toFixed(0)}`);
