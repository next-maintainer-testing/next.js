import { spawn } from "node:child_process";
import net from "node:net";

const host = "127.0.0.1";
const marker = "ISSUE-73938-CUSTOM-UNAUTHORIZED";
const logs = [];

function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      await response.arrayBuffer();
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Timed out waiting for the Next.js development server");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    closed.then(() => true),
    delay(10_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL");
    await closed;
  }
}

let child;
try {
  const port = await getPort();
  const baseUrl = `http://${host}:${port}`;
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", host, "-p", String(port)],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      logs.push(chunk);
      if (logs.join("").length > 20_000) logs.shift();
    });
  }

  await waitForServer(baseUrl, child);
  const response = await fetch(`${baseUrl}/api/unauthorized`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  const renderedCustomUnauthorizedUI = body.includes(marker);

  console.log(JSON.stringify({
    path: "/api/unauthorized",
    status: response.status,
    contentType: response.headers.get("content-type"),
    renderedCustomUnauthorizedUI,
    expectedMarker: marker,
    bodyExcerpt: body.replace(/\s+/g, " ").slice(0, 500),
  }, null, 2));

  process.exitCode = renderedCustomUnauthorizedUI ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(logs.join("").slice(-10_000));
  process.exitCode = 2;
} finally {
  if (child) await stopServer(child);
}
