import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const port = 34116;
const symptom = "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object.";
const installedNextVersion = JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version;
const useWebpackFlag = Number.parseInt(installedNextVersion, 10) >= 16;
let output = "";
let responseBody = "";
let child;

function append(chunk) {
  output += chunk.toString();
  if (output.length > 200000) output = output.slice(-200000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (/Ready in|Local:\s+http/.test(output)) return;
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    await delay(200);
  }
  throw new Error("Timed out waiting for the Next.js development server");
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    delay(10000).then(() => {
      if (child.exitCode === null) {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    }),
  ]);
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once("close", resolve));
  }
}

let result = 2;
try {
  const args = ["node_modules/next/dist/bin/next", "dev"];
  if (useWebpackFlag) args.push("--webpack");
  args.push("-p", String(port));
  child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  await waitForReady();
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(60000) });
  responseBody = await response.text();
  await delay(1000);
  const evidence = `${responseBody}\n${output}`;
  if (response.status === 500 && evidence.includes(symptom)) {
    console.log(`REPRODUCED on Next.js ${installedNextVersion}: HTTP 500 with ${symptom}`);
    result = 0;
  } else {
    console.log(`NOT_REPRODUCED on Next.js ${installedNextVersion}: HTTP ${response.status}; invalid Material UI element runtime error was absent`);
    result = 1;
  }
} catch (error) {
  console.error(`CHECK_FAILED on Next.js ${installedNextVersion}: ${error.stack || error}`);
  console.error(output.slice(-10000));
  result = 2;
} finally {
  process.exitCode = result;
  await stopServer();
}
