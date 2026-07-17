import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";
import puppeteer from "puppeteer";

const host = "127.0.0.1";
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before startup (${child.exitCode})\n${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for Next.js\n${output()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

const port = await availablePort();
const url = `http://${host}:${port}`;
let serverOutput = "";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-H", host, "-p", String(port)],
  { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

let browser;
let finalExitCode = 2;
try {
  await waitForServer(url, server, () => serverOutput);
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.click("#start");
  await page.waitForFunction(
    () => document.querySelector("#result")?.dataset.status === "complete",
    { timeout: 20_000 },
  );
  const result = JSON.parse(await page.$eval("#result", (node) => node.textContent));
  const serialized = result.overlap <= 25 && result.elapsed >= 1_400;
  const parallel = result.overlap >= 600 && result.elapsed <= 1_200;
  console.log(JSON.stringify({
    nextVersion: (await import("next/package.json", { with: { type: "json" } })).default.version,
    elapsedMs: Math.round(result.elapsed),
    overlapMs: result.overlap,
    first: result.first,
    second: result.second,
    symptom: serialized ? "server actions serialized" : parallel ? "server actions parallel" : "ambiguous timing",
  }));
  finalExitCode = serialized ? 0 : parallel ? 1 : 2;
} catch (error) {
  console.error(error?.stack || error);
  console.error(serverOutput.slice(-8_000));
  finalExitCode = 2;
} finally {
  process.exitCode = finalExitCode;
  if (browser) await browser.close();
  await stop(server);
}
