import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const children = [];
const tempDirs = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on("error", reject);
  });
}

function findChrome() {
  const explicit = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of explicit) {
    if (existsSync(candidate)) return candidate;
  }

  const roots = [join(process.env.HOME || "/root", ".cache", "ms-playwright")];
  const names = new Set(["chrome", "headless_shell", "chromium"]);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const queue = [root];
    while (queue.length) {
      const directory = queue.shift();
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) queue.push(path);
        else if (names.has(entry.name)) return path;
      }
    }
  }
  throw new Error("No Chromium executable was found");
}

function startProcess(command, args, name) {
  let output = "";
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const collect = (chunk) => {
    output += chunk.toString();
    if (output.length > 30000) output = output.slice(-30000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.getOutput = () => output;
  child.on("error", (error) => collect(`${name} process error: ${error.stack || error}\n`));
  return child;
}

async function waitForExit(child, name, timeoutMs) {
  const result = await Promise.race([
    new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal }))),
    sleep(timeoutMs).then(() => null),
  ]);
  if (!result) throw new Error(`${name} timed out\n${child.getOutput()}`);
  if (result.code !== 0) throw new Error(`${name} failed (code ${result.code}, signal ${result.signal})\n${child.getOutput()}`);
}

async function waitForHttp(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Process exited before ${url} was ready (code ${child.exitCode})\n${child.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${child.getOutput()}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    this.ws.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.ws.close();
  }
}

async function waitUntil(test, description, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await test();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ""}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5000),
  ]);
  if (child.exitCode === null) {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {}
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2000),
    ]);
  }
}

async function cleanup(cdp) {
  if (cdp) {
    try { cdp.close(); } catch {}
  }
  for (const child of [...children].reverse()) await stopChild(child);
  for (const directory of tempDirs) {
    try { rmSync(directory, { recursive: true, force: true }); } catch {}
  }
}

async function run() {
  const appPort = await freePort();
  const debugPort = await freePort();
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) throw new Error(`Next.js binary is missing at ${nextBin}`);

  const build = startProcess(process.execPath, [nextBin, "build"], "Next.js build");
  await waitForExit(build, "Next.js build", 150000);
  const next = startProcess(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(appPort)], "Next.js");
  await waitForHttp(`http://127.0.0.1:${appPort}/`, next, 30000);

  const profile = mkdtempSync(join(tmpdir(), "next-77064-chrome-"));
  tempDirs.push(profile);
  const chrome = startProcess(findChrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], "Chromium");

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, chrome, 30000);
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await Promise.all([
    cdp.send("Page.enable", {}, sessionId),
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Network.enable", {}, sessionId),
  ]);

  const requests = new Map();
  const dashboardRequests = [];
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.requestWillBeSent") {
      const request = {
        id: message.params.requestId,
        url: message.params.request.url,
        method: message.params.request.method,
        headers: message.params.request.headers,
        finished: false,
        failed: false,
        responseStatus: null,
      };
      requests.set(request.id, request);
      try {
        const parsed = new URL(request.url);
        if (parsed.pathname === "/dashboard/audit-board") dashboardRequests.push(request);
      } catch {}
    } else if (message.method === "Network.responseReceived") {
      const request = requests.get(message.params.requestId);
      if (request) request.responseStatus = message.params.response.status;
    } else if (message.method === "Network.loadingFinished") {
      const request = requests.get(message.params.requestId);
      if (request) request.finished = true;
    } else if (message.method === "Network.loadingFailed") {
      const request = requests.get(message.params.requestId);
      if (request) {
        request.finished = true;
        request.failed = true;
      }
    }
  });

  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${appPort}/` }, sessionId);
  await waitUntil(async () => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState === 'complete' && Object.keys(document.querySelector('input[name=title]') || {}).some(k => k.startsWith('__reactProps'))",
      returnByValue: true,
    }, sessionId);
    return result.result.value;
  }, "the home page to hydrate", 30000);

  await sleep(1000);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('input[name=title]');
      if (!input) throw new Error('missing input');
      input.focus();
    })()`,
  }, sessionId);
  await cdp.send("Input.insertText", { text: "Audit Board" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  const interaction = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelector('input[name=title]')?.value",
    returnByValue: true,
  }, sessionId);
  if (interaction.result.value !== "Audit Board") throw new Error(`Could not enter title: ${interaction.result.value}`);

  await waitUntil(() => dashboardRequests.some((request) => request.responseStatus >= 200 && request.responseStatus < 400), "the dashboard prefetch response", 30000).catch((error) => {
    throw new Error(`${error.message}; observed requests: ${JSON.stringify([...requests.values()].map(({ url, method, responseStatus, finished, failed }) => ({ url, method, responseStatus, finished, failed })))}`);
  });
  const prefetch = dashboardRequests.find((request) => request.responseStatus >= 200 && request.responseStatus < 400);
  await waitUntil(() => prefetch.finished, "the dashboard prefetch request to settle", 30000);
  const preSubmitCount = dashboardRequests.length;

  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const button = document.querySelector('button');
      if (!button) throw new Error('missing submit button');
      button.click();
    })()`,
    awaitPromise: true,
  }, sessionId);

  await waitUntil(async () => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "location.pathname === '/dashboard/audit-board' && document.body.innerText.includes('Dashboard: audit-board')",
      returnByValue: true,
    }, sessionId);
    return result.result.value;
  }, "navigation to the prefetched dashboard", 30000);
  await sleep(1000);

  const postSubmitRequests = dashboardRequests.slice(preSubmitCount);
  const symptomPresent = postSubmitRequests.length > 0;
  const observation = {
    symptom: "dashboard RSC request after a completed explicit prefetch and server action",
    prefetchSettledAfterSuccessfulResponse: prefetch.finished && prefetch.responseStatus >= 200 && prefetch.responseStatus < 400,
    preSubmitDashboardRequestCount: preSubmitCount,
    postSubmitDashboardRequestCount: postSubmitRequests.length,
    dashboardRequests: dashboardRequests.map((request) => ({
      url: request.url,
      method: request.method,
      prefetchHeader: request.headers.Purpose || request.headers.purpose || request.headers["Next-Router-Prefetch"] || request.headers["next-router-prefetch"] || null,
      responseStatus: request.responseStatus,
      finished: request.finished,
      failed: request.failed,
    })),
    finalPath: "/dashboard/audit-board",
    symptomPresent,
  };
  console.log(JSON.stringify(observation));
  return { exitCode: symptomPresent ? 0 : 1, cdp };
}

let cdp;
let exitCode = 2;
try {
  const result = await run();
  cdp = result.cdp;
  exitCode = result.exitCode;
} catch (error) {
  console.error(error?.stack || error);
  for (const child of children) {
    const output = child.getOutput?.();
    if (output) console.error(output);
  }
  exitCode = 2;
}
process.exitCode = exitCode;
await cleanup(cdp);
