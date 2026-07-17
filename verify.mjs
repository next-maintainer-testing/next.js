import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const route = "/2025/z-probe";
const triggerFile = path.join(process.cwd(), "app/z-probe/page.js");
const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
const original = await readFile(triggerFile, "utf8");
let child;
let logs = "";
let intendedExit = 2;
let observation = "check did not complete";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function request(port, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: route, agent: false }, (res) => {
      res.resume();
      res.once("end", () => resolve({ status: res.statusCode, error: null }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    req.once("error", (error) => resolve({ status: null, error: error.message }));
  });
}

async function waitForBaseline(port) {
  const deadline = Date.now() + 120000;
  let last;
  while (Date.now() < deadline) {
    last = await request(port, 10000);
    if (last.status === 200) return;
    if (child.exitCode !== null) throw new Error(`dev server exited early with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`route never returned baseline 200 (last=${JSON.stringify(last)})`);
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

try {
  const port = await reservePort();
  child = spawn(process.execPath, [nextBin, "dev", "--turbopack", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const retainLog = (chunk) => { logs = (logs + chunk.toString()).slice(-30000); };
  child.stdout.on("data", retainLog);
  child.stderr.on("data", retainLog);
  await waitForBaseline(port);

  const statuses = new Map();
  const errors = [];
  let requests = 0;
  for (let round = 1; round <= 6; round++) {
    await writeFile(triggerFile, `${original}\n// hmr-trigger-${round}\n`, "utf8");
    const deadline = Date.now() + 1200;
    await Promise.all(Array.from({ length: 20 }, async () => {
      while (Date.now() < deadline) {
        const result = await request(port);
        requests++;
        if (result.status !== null) statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
        if (result.error) errors.push(result.error);
      }
    }));
    if ((statuses.get(404) || 0) > 0) break;
  }

  const counts = Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0]));
  const notFound = statuses.get(404) || 0;
  if (notFound > 0) {
    intendedExit = 0;
    observation = `baseline ${route}=200; observed ${notFound} transient 404 response(s) among ${requests} requests immediately after HMR-triggering source edits; statusCounts=${JSON.stringify(counts)}`;
  } else if (errors.length > Math.max(5, Math.floor(requests / 10))) {
    intendedExit = 2;
    observation = `request probe unreliable: ${errors.length}/${requests} failed; statusCounts=${JSON.stringify(counts)}; firstError=${errors[0]}`;
  } else if ([...statuses.keys()].some((status) => status !== 200)) {
    intendedExit = 2;
    observation = `unexpected non-200 response(s); statusCounts=${JSON.stringify(counts)}`;
  } else {
    intendedExit = 1;
    observation = `baseline ${route}=200; no transient 404 in ${requests} requests immediately after six HMR-triggering source edits; statusCounts=${JSON.stringify(counts)}`;
  }
} catch (error) {
  intendedExit = 2;
  observation = `verification failed: ${error.stack || error}`;
} finally {
  process.exitCode = intendedExit;
  try {
    await writeFile(triggerFile, original, "utf8");
  } catch (error) {
    process.exitCode = 2;
    observation += `; failed to restore trigger file: ${error.message}`;
  }
  await stopChild();
  console.log(observation);
  if (process.exitCode === 2) console.error(logs.slice(-5000));
}
