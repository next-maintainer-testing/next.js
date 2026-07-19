import { spawn } from "node:child_process";

const port = 34567;
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
let output = "";
let responseStatus = null;
let responseBody = "";
let outcome = 2;

const server = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: new URL(".", import.meta.url).pathname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const append = (chunk) => {
  output += chunk.toString();
  if (output.length > 1_000_000) output = output.slice(-1_000_000);
};
server.stdout.on("data", append);
server.stderr.on("data", append);

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;

  const exited = new Promise((resolve) => server.once("exit", resolve));
  try {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  } catch {}

  if (await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)])) return;

  try {
    if (process.platform === "win32") server.kill("SIGKILL");
    else process.kill(-server.pid, "SIGKILL");
  } catch {}
  await Promise.race([exited, sleep(5_000)]);
}

try {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      responseStatus = response.status;
      responseBody = await response.text();
      break;
    } catch {
      await sleep(500);
    }
  }

  await sleep(1_000);
  const evidence = `${output}\n${responseBody}`;
  const packageNamed = /(?:node_modules[\\/]ts-package-example[\\/]index\.ts|ts-package-example)/i.test(evidence);
  const parseFailure = /Module parse failed|Unexpected token/i.test(evidence);

  if (responseStatus === 200) {
    outcome = 1;
    console.log("SYMPTOM_ABSENT: GET / returned HTTP 200 and the TypeScript package loaded.");
  } else if (responseStatus === 500 && packageNamed && parseFailure) {
    outcome = 0;
    console.log("SYMPTOM_PRESENT: GET / returned HTTP 500 with the reported TypeScript-package parse failure.");
  } else {
    outcome = 2;
    console.error(`CHECK_FAILED: status=${responseStatus ?? "none"}; serverExit=${server.exitCode ?? "running"}`);
    console.error(evidence.slice(-12_000));
  }
} catch (error) {
  outcome = 2;
  console.error("CHECK_FAILED:", error);
} finally {
  process.exitCode = outcome;
  await stopServer();
}
