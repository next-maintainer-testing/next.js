import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

const host = "127.0.0.1";
const hostHeader = "localhost";
const startupTimeoutMs = 120_000;
let child;
let logs = "";

async function reservePort() {
  const server = createServer();
  server.listen(0, host);
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("Could not allocate a local port");
  return port;
}

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  const exited = once(child, "exit");
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") console.error(error);
    }
  }, 10_000);
  await exited;
  clearTimeout(timer);
}

async function main() {
  const port = await reservePort();
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", host, "-p", String(port)],
    { cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { logs = (logs + chunk).slice(-20_000); });
  }

  const deadline = Date.now() + startupTimeoutMs;
  let response;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${logs}`);
    }
    try {
      response = await fetch(`http://${host}:${port}/custom/hello`, {
        headers: { host: `${hostHeader}:${port}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) break;
      lastError = new Error(`Route returned HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!response?.ok) {
    throw new Error(`Route did not become ready: ${lastError?.message ?? "unknown error"}\n${logs}`);
  }
  const body = await response.json();
  if (typeof body?.url !== "string") {
    throw new Error(`Route returned an invalid payload: ${JSON.stringify(body)}`);
  }

  const returnedPath = new URL(body.url).pathname;
  const requestedPath = "/custom/hello";
  const symptomPresent = returnedPath === "/hello";
  console.log(JSON.stringify({ requestedPath, returnedUrl: body.url, returnedPath, symptomPresent }));
  process.exitCode = symptomPresent ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 2;
} finally {
  await stopChild();
}
