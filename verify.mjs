import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = 33000 + (process.pid % 2000);
let server;

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeout ?? 180_000);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

async function waitUntilReady(url) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("server did not become ready");
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const forced = setTimeout(() => server.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(forced);
}

try {
  await rm(".next", { recursive: true, force: true });
  const build = await run(["build"], { timeout: 210_000 });
  if (build.code !== 0) {
    console.error(`next build failed (${build.code ?? build.signal})\n${build.output.slice(-4000)}`);
    process.exitCode = 2;
  } else {
    server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PRIVATE_MINIMAL_MODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverOutput = "";
    server.stdout.on("data", (chunk) => (serverOutput += chunk));
    server.stderr.on("data", (chunk) => (serverOutput += chunk));

    const origin = `http://127.0.0.1:${port}`;
    await waitUntilReady(`${origin}/`);
    const response = await fetch(`${origin}/project/A/token/B.prefetch`, {
      headers: {
        "x-matched-path": "/(.)project/[id]/token/[token]",
        "next-url": "/",
        "rsc": "1",
        "next-router-prefetch": "1",
      },
    });
    const body = await response.text();
    if (!response.ok || !body.includes("Intercepted")) {
      console.error(
        `prefetch invocation failed: HTTP ${response.status}; intercepted=${body.includes("Intercepted")}\n${body.slice(0, 2000)}\n${serverOutput.slice(-2000)}`,
      );
      process.exitCode = 2;
    } else if (/Token: [^\n]{0,160}B\.prefetch/.test(body)) {
      console.log("symptom present: intercepted prefetch rendered token B.prefetch instead of B");
      process.exitCode = 0;
    } else if (/Token: [^\n]{0,160}B/.test(body) && !body.includes("B.prefetch")) {
      console.log("symptom absent: intercepted prefetch rendered token B");
      process.exitCode = 1;
    } else {
      console.error(`could not determine rendered token from prefetch response\n${body.slice(0, 3000)}`);
      process.exitCode = 2;
    }
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
