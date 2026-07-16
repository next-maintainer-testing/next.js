import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import puppeteer, { PUPPETEER_REVISIONS } from "puppeteer";
import { Browser, computeExecutablePath } from "@puppeteer/browsers";

const runForeground = async (command, args) => {
  const processHandle = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  processHandle.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-20_000);
  });
  processHandle.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-20_000);
  });
  const [code] = await once(processHandle, "exit");
  if (code !== 0) throw new Error(`Browser installation failed (${code}).\n${output}`);
};

const ensureBrowser = async () => {
  const buildId = PUPPETEER_REVISIONS["chrome-headless-shell"];
  const executablePath = computeExecutablePath({
    cacheDir: puppeteer.configuration.cacheDirectory,
    browser: Browser.CHROMEHEADLESSSHELL,
    buildId,
  });
  try {
    await access(executablePath);
  } catch {
    await rm(dirname(dirname(executablePath)), { recursive: true, force: true });
    await runForeground(process.execPath, [
      "node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js",
      "browsers",
      "install",
      "chrome-headless-shell",
    ]);
    try {
      await access(executablePath);
    } catch {
      const archivePath = join(
        puppeteer.configuration.cacheDirectory,
        "chrome-headless-shell",
        `${buildId}-chrome-headless-shell-linux64.zip`,
      );
      await runForeground("unzip", [
        "-o",
        archivePath,
        "-d",
        dirname(dirname(executablePath)),
      ]);
      await access(executablePath);
    }
  }
  return executablePath;
};

const getFreePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const waitForServer = async (url, child, getLogs) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js dev server exited early (${child.exitCode}).\n${getLogs()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Next.js dev server.\n${getLogs()}`);
};

const stopChild = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
};

let child;
let browser;
let logs = "";
let result = {
  code: 2,
  message: "Verification did not complete.",
};

try {
  const executablePath = await ensureBrowser();
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const appendLog = (chunk) => {
    logs = (logs + chunk.toString()).slice(-20_000);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  await waitForServer(origin, child, () => logs);
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(`${origin}/signin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-testid="full-signin-page"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="same-route-push"][data-hydrated="true"]', { timeout: 30_000 });

  const modalBeforePush = await page.$('[data-testid="intercepted-signin-modal"]');
  if (modalBeforePush) {
    throw new Error("Intercepting modal was already present on the initial hard navigation.");
  }

  await page.click('[data-testid="same-route-push"]');
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const modalAfterPush = await page.$('[data-testid="intercepted-signin-modal"]');

  if (modalAfterPush) {
    result = {
      code: 0,
      message: "SYMPTOM PRESENT: router.push('/signin') from /signin rendered the intercepted @authModal route.",
    };
  } else {
    result = {
      code: 1,
      message: "SYMPTOM ABSENT: router.push('/signin') from /signin did not render the intercepted @authModal route.",
    };
  }
} catch (error) {
  result = {
    code: 2,
    message: `CHECK FAILED: ${error?.stack || error}\n${logs}`,
  };
}

process.exitCode = result.code;
console.log(result.message);

if (browser) await browser.close();
await stopChild(child);
