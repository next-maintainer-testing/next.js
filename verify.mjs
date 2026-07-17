import { spawn } from "node:child_process";
import net from "node:net";

const host = "127.0.0.1";
let child;
let output = "";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port === null) reject(new Error("Could not allocate a port"));
        else resolve(port);
      });
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Next.js");
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await closed;
  }
}

try {
  const port = await getFreePort();
  const url = `http://${host}:${port}/`;
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", host, "-p", String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  await waitForServer(url, 120000);
  output = "";
  const response = await fetch(url, { cache: "no-store" });
  await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`Route returned HTTP ${response.status}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 750));

  const marker = output.match(/CLIENT_INTERNALS_VALUE_TYPE:(undefined|object)/)?.[1];
  if (!marker) {
    throw new Error(`Route did not log the client internals value type. Output:\n${output}`);
  }
  const symptomPresent = marker === "undefined";
  process.exitCode = symptomPresent ? 0 : 1;
  console.log(symptomPresent
    ? "SYMPTOM_PRESENT: server React client internals are undefined"
    : "SYMPTOM_ABSENT: server React client internals are defined");
} catch (error) {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: ${error instanceof Error ? error.stack : error}`);
  if (output) console.error(output);
} finally {
  await stopChild();
}
