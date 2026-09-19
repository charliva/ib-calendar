#!/usr/bin/env node

const args = process.argv.slice(2);
const target = args[0] ?? "http://localhost:3000";
const users = Number.parseInt(args[1] ?? "20", 10);
const rounds = Number.parseInt(args[2] ?? "10", 10);

if (!Number.isFinite(users) || users <= 0) {
  console.error(`Invalid user count: ${args[1]}`);
  process.exit(1);
}

if (!Number.isFinite(rounds) || rounds <= 0) {
  console.error(`Invalid round count: ${args[2]}`);
  process.exit(1);
}

console.log(`Target: ${target}`);
console.log(`Users: ${users}`);
console.log(`Rounds: ${rounds}`);

let failures = 0;

for (let round = 1; round <= rounds; round += 1) {
  const start = performance.now();

  const requests = Array.from({ length: users }, async () => {
    const response = await fetch(`${target}/api/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename: "load-test.txt", data: "" }),
    });

    return response.status;
  });

  const statuses = await Promise.all(requests);
  const wallTime = performance.now() - start;
  const rateLimited = statuses.filter((status) => status === 429).length;
  const errors = statuses.filter((status) => status >= 500).length;

  console.log(
    `Round ${round}/${rounds}: ${wallTime.toFixed(0)}ms, 429s=${rateLimited}, 5xx=${errors}`,
  );

  if (rateLimited > 0) {
    failures += rateLimited;
  }
}

console.log(`Total 429s: ${failures}`);

if (failures > 0) {
  process.exitCode = 1;
}
