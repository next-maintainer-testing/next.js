import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextProcess;
let browserProcess;
let profileDir;
let finalCode = 2;

async function isExecutable(file) {
  if (!file) return false;
  try {
    await access(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function scanForChromium(root, depth = 0) {
  if (!root || depth > 5) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && ["chrome", "chrome-headless-shell", "chromium"].includes(entry.name)) {
      if (await isExecutable(fullPath)) matches.push(fullPath);
    } else if (entry.isDirectory()) {
      matches.push(...await scanForChromium(fullPath, depth + 1));
    }
  }
  return matches;
}

async function findChromium() {
  const explicit = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const candidate of explicit) {
    if (await isExecutable(candidate)) return candidate;
  }

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), ".cache", "ms-playwright"),
    "/ms-playwright",
    "/home/pwuser/.cache/ms-playwright",
  ];
  for (const root of roots) {
    const matches = await scanForChromium(root);
    matches.sort((a, b) => {
      const headlessOrder = Number(!a.includes("headless")) - Number(!b.includes("headless"));
      return headlessOrder || b.localeCompare(a);
    });
    if (matches.length) return matches[0];
  }
  throw new Error("No Chromium executable was available for the browser-level check");
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("Failed to reserve a local port");
  return port;
}

function collectOutput(child, label) {
  let output = "";
  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 12000) output = output.slice(-12000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return () => `${label}:\n${output}`;
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/start`, { redirect: "manual" });
      await response.arrayBuffer();
      if (response.status > 0) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("Timed out waiting for Next.js to become ready");
}

class CdpPipe {
  constructor(child, onEvent) {
    this.child = child;
    this.onEvent = onEvent;
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    child.stdio[4].on("data", (chunk) => this.consume(chunk));
    child.stdio[4].on("error", (error) => this.rejectAll(error));
    child.once("exit", (code, signal) => this.rejectAll(new Error(`Chromium exited (${code ?? signal})`)));
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const delimiter = this.buffer.indexOf(0);
      if (delimiter < 0) return;
      const raw = this.buffer.subarray(0, delimiter).toString();
      this.buffer = this.buffer.subarray(delimiter + 1);
      if (!raw) continue;
      let message;
      try {
        message = JSON.parse(raw);
      } catch (error) {
        this.rejectAll(new Error(`Invalid CDP response: ${error.message}`));
        continue;
      }
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) continue;
        this.pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      } else {
        this.onEvent(message);
      }
    }
  }

  rejectAll(error) {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  command(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.child.stdio[3].write(`${JSON.stringify(message)}\0`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch {}
  }
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    sleep(3000).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try { child.kill("SIGKILL"); } catch {}
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(1000),
    ]);
  }
}

try {
  const appDir = process.cwd();
  const port = await getFreePort();
  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  nextProcess = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: appDir,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const nextOutput = collectOutput(nextProcess, "Next.js output");
  await waitForServer(port, nextProcess);

  profileDir = await mkdtemp(path.join(os.tmpdir(), "next-67522-chromium-"));
  browserProcess = spawn(await findChromium(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-pipe",
    "about:blank",
  ], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
  });
  const browserOutput = collectOutput(browserProcess, "Chromium output");

  let navigationStarted = false;
  let rootRscRequests = 0;
  let loginRscRequests = 0;
  const observedUrls = [];
  let symptomResolve;
  const symptomSeen = new Promise((resolve) => { symptomResolve = resolve; });
  const cdp = new CdpPipe(browserProcess, (message) => {
    if (!navigationStarted || message.method !== "Network.requestWillBeSent") return;
    const rawUrl = message.params?.request?.url;
    if (!rawUrl) return;
    let url;
    try { url = new URL(rawUrl); } catch { return; }
    if (!url.searchParams.has("_rsc")) return;
    if (observedUrls.length < 20) observedUrls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/") rootRscRequests += 1;
    if (url.pathname === "/login") {
      loginRscRequests += 1;
      if (loginRscRequests >= 6) symptomResolve(true);
    }
  });

  const { targetId } = await cdp.command("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.command("Target.attachToTarget", { targetId, flatten: true });
  await cdp.command("Network.enable", {}, sessionId);
  await cdp.command("Page.enable", {}, sessionId);
  await cdp.command("Runtime.enable", {}, sessionId);
  await cdp.command("Page.navigate", { url: `http://127.0.0.1:${port}/start` }, sessionId);

  let linkReady = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await cdp.command("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('#go-home'))",
      returnByValue: true,
    }, sessionId);
    if (result?.result?.value === true) {
      linkReady = true;
      break;
    }
    await sleep(250);
  }
  if (!linkReady) throw new Error("The /start navigation link did not render");
  await sleep(1500);

  navigationStarted = true;
  const click = await cdp.command("Runtime.evaluate", {
    expression: "document.querySelector('#go-home').click(); true",
    returnByValue: true,
  }, sessionId);
  if (click?.result?.value !== true) throw new Error("Failed to click the client-side navigation link");

  await Promise.race([symptomSeen, sleep(15000)]);
  console.log(JSON.stringify({
    symptom: "continuous /login RSC requests after a soft navigation redirects into an intercepted parallel route",
    rootRscRequests,
    loginRscRequests,
    observedUrls,
  }, null, 2));

  if (loginRscRequests >= 6) {
    console.log("ISSUE_PRESENT: The browser continuously requested the /login RSC payload.");
    finalCode = 0;
  } else if (rootRscRequests >= 1 && loginRscRequests >= 1) {
    console.log("ISSUE_ABSENT: The redirect reached /login without a continuous RSC request loop.");
    finalCode = 1;
  } else {
    console.error("CHECK_FAILED: The soft-navigation redirect did not produce conclusive RSC requests.");
    console.error(nextOutput());
    console.error(browserOutput());
    finalCode = 2;
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  await terminate(browserProcess);
  await terminate(nextProcess);
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
}
