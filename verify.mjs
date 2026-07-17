import { spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fetchUntil(url, timeoutMs, predicate = (response) => response.ok) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (predicate(response)) return response;
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function browserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    ...globSync("/root/.cache/ms-playwright/**/chrome", { withFileTypes: false }),
    ...globSync("/root/.cache/ms-playwright/**/headless_shell", { withFileTypes: false }),
    ...globSync("/ms-playwright/**/chrome", { withFileTypes: false }),
    ...globSync("/ms-playwright/**/headless_shell", { withFileTypes: false }),
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No Chromium executable is available for the browser-level check");
  return found;
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForValue(cdp, sessionId, expression, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`);
    lastValue = result.result.value;
    if (predicate(lastValue)) return lastValue;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for browser state; last value: ${JSON.stringify(lastValue)}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5000).then(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(2000)]);
  }
}

let nextProcess;
let chromeProcess;
let cdp;
let profileDir;
let exitCode = 2;

try {
  const appPort = await freePort();
  const browserPort = await freePort();
  profileDir = mkdtempSync(join(tmpdir(), "next-77101-chrome-"));

  nextProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(appPort)], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  await fetchUntil(`http://127.0.0.1:${appPort}/`, 90000);

  chromeProcess = spawn(browserExecutable(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${browserPort}`,
    "about:blank",
  ], { detached: true, stdio: "ignore" });

  const versionResponse = await fetchUntil(`http://127.0.0.1:${browserPort}/json/version`, 30000);
  const { webSocketDebuggerUrl } = await versionResponse.json();
  cdp = new Cdp(webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${appPort}/` }, sessionId);

  await waitForValue(
    cdp,
    sessionId,
    "document.readyState === 'complete' && !!document.querySelector('button')",
    Boolean,
    30000,
  );
  // Ensure React hydration has attached the Server Action submit handler.
  await sleep(2000);
  await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('button').click(); true",
    returnByValue: true,
  }, sessionId);

  const location = await waitForValue(
    cdp,
    sessionId,
    "({href: location.href, pathname: location.pathname, search: location.search, hash: location.hash})",
    (value) => value?.pathname === "/example" && value?.search === "?hello=world",
    30000,
  );

  if (location.hash === "") {
    console.log(`SYMPTOM_PRESENT: browser ended at ${location.href}; expected #hash`);
    exitCode = 0;
  } else if (location.hash === "#hash") {
    console.log(`SYMPTOM_ABSENT: browser preserved the fragment at ${location.href}`);
    exitCode = 1;
  } else {
    throw new Error(`Unexpected browser URL after Server Action redirect: ${location.href}`);
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack ?? error}`);
  exitCode = 2;
} finally {
  // Make the verdict durable before releasing the browser or server handles.
  process.exitCode = exitCode;
  try {
    cdp?.close();
  } catch {}
  await stopProcess(chromeProcess);
  await stopProcess(nextProcess);
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
