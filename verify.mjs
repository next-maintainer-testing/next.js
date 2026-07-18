import { spawn } from "node:child_process";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER_DIR = "/tmp/next-61320-puppeteer";
const PUPPETEER_VERSION = "24.40.0";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function ensurePuppeteer() {
  const entry = `${BROWSER_DIR}/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js`;
  const installer = `${BROWSER_DIR}/node_modules/puppeteer/install.mjs`;
  try {
    await access(entry);
  } catch {
    await rm(BROWSER_DIR, { recursive: true, force: true });
    await mkdir(BROWSER_DIR, { recursive: true });
    await run("npm", [
      "install",
      "--prefix",
      BROWSER_DIR,
      "--no-save",
      "--package-lock=false",
      `puppeteer@${PUPPETEER_VERSION}`,
    ]);
  }

  const module = await import(pathToFileURL(entry).href);
  const executablePath = module.default.executablePath();
  try {
    await access(executablePath);
  } catch {
    await run(process.execPath, [installer]).catch(() => {});
    try {
      await access(executablePath);
    } catch {
      const versionDir = dirname(dirname(executablePath));
      const productDir = dirname(versionDir);
      const archive = (await readdir(productDir)).find((name) => name.endsWith("-chrome-linux64.zip"));
      if (!archive) throw new Error(`Puppeteer browser archive was not installed in ${productDir}`);
      await run("unzip", ["-qo", `${productDir}/${archive}`, "-d", versionDir]);
      await access(executablePath);
    }
  }
  return { puppeteer: module.default, executablePath };
}

function getPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

let next;
let browser;
let exitCode = 2;

try {
  const { puppeteer, executablePath } = await ensurePuppeteer();
  const port = await getPort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;

  next = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });

  await waitForServer(`${origin}/ssg/1`, next);
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const appRenderLogs = [];

  page.on("console", (message) => {
    const text = message.text().trim();
    if (/^\d+$/.test(text)) appRenderLogs.push(Number(text));
  });
  page.on("pageerror", (error) => console.error(`Browser page error: ${error.message}`));

  await page.goto(`${origin}/ssg/1`, { waitUntil: "networkidle0", timeout: 120_000 });
  await page.waitForSelector("button", { timeout: 30_000 });
  appRenderLogs.length = 0;

  const buttons = await page.$$("button");
  if (buttons.length < 2) throw new Error(`Expected two route buttons, found ${buttons.length}`);
  await buttons[1].click();
  await page.waitForFunction(() => location.pathname === "/ssg/2", { timeout: 120_000 });

  const deadline = Date.now() + 5_000;
  while (appRenderLogs.length <= 20 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const renderCount = appRenderLogs.length;
  const symptomPresent = renderCount > 20;
  const range = renderCount
    ? ` (console counters ${appRenderLogs[0]} through ${appRenderLogs.at(-1)})`
    : "";
  console.log(`Observed ${renderCount} client App renders after routing /ssg/1 -> /ssg/2${range}`);
  console.log(symptomPresent ? "SYMPTOM_PRESENT" : "SYMPTOM_ABSENT");
  exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  exitCode = 2;
} finally {
  process.exitCode = exitCode;
  if (browser) await browser.close().catch((error) => console.error(`Browser cleanup failed: ${error}`));
  await stop(next).catch((error) => console.error(`Server cleanup failed: ${error}`));
}
