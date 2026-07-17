import { spawn } from "node:child_process";
import net from "node:net";

const expected = "It is not allowed to define inline \"use cache\" annotated functions in Client Components";
const successMarker = "cache-dynamic-ok";
const deadline = Date.now() + 120_000;
let output = "";

function append(chunk) {
  output = (output + chunk.toString()).slice(-2_000_000);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const closed = new Promise((resolve) => child.once("close", resolve));
  await Promise.race([closed, sleep(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("close", resolve));
  }
}

let child;
try {
  const port = await freePort();
  child = spawn(process.execPath, [
    "node_modules/next/dist/bin/next",
    "dev",
    "--turbopack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  let result = null;
  while (Date.now() < deadline && result === null) {
    if (output.includes(expected)) {
      result = { code: 0, message: "Reported inline use-cache Client Component error observed." };
      break;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Development server exited before verification (code ${child.exitCode}, signal ${child.signalCode}).`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { "user-agent": "next-82650-verifier" },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.text();
      append(body);
      if (body.includes(expected) || output.includes(expected)) {
        result = { code: 0, message: `Reported compiler error observed in an HTTP ${response.status} response.` };
      } else if (response.ok && body.includes(successMarker)) {
        result = { code: 1, message: "Route rendered the dynamically imported cached component successfully." };
      } else if (response.status >= 500) {
        throw new Error(`Route failed with HTTP ${response.status} without the reported error.`);
      }
    } catch (error) {
      if (error?.name !== "TypeError" && error?.name !== "TimeoutError") throw error;
    }
    if (result === null) await sleep(300);
  }

  if (result === null) throw new Error("Timed out waiting for a conclusive route response.");
  process.exitCode = result.code;
  console.log(result.message);
} catch (error) {
  process.exitCode = 2;
  console.error(error instanceof Error ? error.stack : String(error));
  if (output) console.error(output.slice(-12_000));
} finally {
  if (child) await stop(child);
}
