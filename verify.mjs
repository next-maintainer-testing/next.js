import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const publicHost = "proxy.example.test";
const expectedUrl = `https://${publicHost}/test`;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function requestRoute(port) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/test",
      method: "GET",
      headers: {
        host: publicHost,
        "x-forwarded-host": publicHost,
        "x-forwarded-proto": "https",
      },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.setTimeout(5_000, () => request.destroy(new Error("request timed out")));
    request.once("error", reject);
    request.end();
  });
}

async function waitForRoute(port, child) {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving requests (code ${child.exitCode})`);
    }
    try {
      const response = await requestRoute(port);
      if (response.status === 200) return response;
      lastError = new Error(`unexpected HTTP status ${response.status}: ${response.body.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not serve /test: ${lastError?.message ?? "unknown error"}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const closed = new Promise((resolve) => child.once("close", resolve));
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 5_000);
  await closed;
  clearTimeout(timer);
}

const port = await reservePort();
const child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

let exitCode = 2;
try {
  const response = await waitForRoute(port, child);
  const payload = JSON.parse(response.body);
  const actualUrl = payload?.url?.actual;
  if (typeof actualUrl !== "string") {
    throw new Error(`route response omitted url.actual: ${response.body.slice(0, 1000)}`);
  }

  const symptomPresent = actualUrl !== expectedUrl;
  console.log(JSON.stringify({ expectedUrl, actualUrl, symptomPresent }));
  exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(logs.slice(-4000));
  exitCode = 2;
} finally {
  process.exitCode = exitCode;
  await stop(child);
}
