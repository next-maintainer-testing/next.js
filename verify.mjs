import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

let browser;
let nextProcess;
let remoteServer;

function startRemote() {
  return new Promise((resolve, reject) => {
    remoteServer = createServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("<!doctype html><html><body>iframe content</body></html>");
    });
    remoteServer.once("error", reject);
    remoteServer.listen(5173, "::", resolve);
  });
}

async function waitForNext() {
  const deadline = Date.now() + 90_000;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) {
      throw new Error(`next dev exited early with code ${nextProcess.exitCode}`);
    }
    try {
      const response = await fetch("http://127.0.0.1:3000", {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        await response.text();
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`next dev did not become ready: ${lastError}`);
}

function signalNext(signal) {
  if (!nextProcess) return;
  try {
    process.kill(-nextProcess.pid, signal);
  } catch {
    try { nextProcess.kill(signal); } catch {}
  }
}

async function stopNext() {
  if (!nextProcess) return;
  signalNext("SIGTERM");
  if (nextProcess.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => nextProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  signalNext("SIGKILL");
  if (nextProcess.exitCode === null) {
    await new Promise((resolve) => nextProcess.once("exit", resolve));
  }
}

async function closeRemote() {
  if (!remoteServer?.listening) return;
  await new Promise((resolve, reject) => {
    remoteServer.close((error) => error ? reject(error) : resolve());
  });
}

try {
  await startRemote();
  nextProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  let nextOutput = "";
  nextProcess.stdout.on("data", (chunk) => { nextOutput = (nextOutput + chunk).slice(-8_000); });
  nextProcess.stderr.on("data", (chunk) => { nextOutput = (nextOutput + chunk).slice(-8_000); });
  await waitForNext();

  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle0", timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const states = await page.$$eval("p", (elements) => elements.map((element) => element.textContent?.trim()));
  const loadedTrue = states.filter((state) => state === "Loaded: true").length;
  const loadedFalse = states.filter((state) => state === "Loaded: false").length;

  if (loadedFalse > 0 && loadedTrue + loadedFalse === 3) {
    console.log(`SYMPTOM_PRESENT: ${loadedFalse} of 3 iframe onLoad handlers were missed in next dev`);
    process.exitCode = 0;
  } else if (loadedTrue === 3 && loadedFalse === 0) {
    console.log("SYMPTOM_ABSENT: all 3 iframe onLoad handlers fired in next dev");
    process.exitCode = 1;
  } else {
    throw new Error(`Could not observe all iframe states (true=${loadedTrue}, false=${loadedFalse}). Next output:\n${nextOutput}`);
  }
} catch (error) {
  console.error("CHECK_FAILED:", error.stack || error);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await stopNext();
  await closeRemote();
}
