import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const WebSocket = require("next/dist/compiled/ws");
const children = new Set();
let finalCode = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function executableFiles(root) {
  const found = [];
  async function visit(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && (entry.name === "chrome" || entry.name === "headless_shell")) {
        try {
          if ((await stat(full)).mode & 0o111) found.push(full);
        } catch {}
      }
    }
  }
  await visit(root);
  return found.sort();
}

async function findChromium() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  let candidates = await executableFiles(cache);
  if (candidates.length === 0) {
    const installer = run("npx", ["--yes", "playwright@1.58.2", "install", "chromium"], {
      env: { ...process.env, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: "ubuntu24.04-x64" },
      stdio: "inherit",
    });
    await new Promise((resolve) => installer.once("exit", resolve));
    candidates = await executableFiles(cache);
  }
  if (candidates.length === 0) throw new Error("No Chromium executable was installed");
  return candidates.at(-1);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }
  close() { this.ws.close(); }
}

async function waitUntil(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(3000).then(() => { if (child.exitCode === null) child.kill("SIGKILL"); }),
  ]);
  if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
}

let next;
let chrome;
let cdp;
let profile;
try {
  const appPort = await freePort();
  const chromePort = await freePort();
  const nextLogs = [];
  next = run(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "-p", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", REPRO_ORIGIN: `http://127.0.0.1:${appPort}` },
  });
  for (const stream of [next.stdout, next.stderr]) stream.on("data", (chunk) => {
    nextLogs.push(String(chunk));
    if (nextLogs.length > 100) nextLogs.shift();
  });
  await waitForHttp(`http://127.0.0.1:${appPort}/?page=2`, 90000, next);

  const executable = await findChromium();
  profile = await mkdtemp(join(tmpdir(), "next-77759-chrome-"));
  chrome = run(executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    `--remote-debugging-port=${chromePort}`, `--user-data-dir=${profile}`, "about:blank",
  ]);
  await waitForHttp(`http://127.0.0.1:${chromePort}/json/version`, 30000, chrome);
  const targets = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("Chromium did not expose a page target");

  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  const events = [];
  cdp.on("Runtime.consoleAPICalled", ({ args }) => {
    const values = args.map((arg) => arg.value ?? arg.description);
    const text = values.map(String).join(" ");
    if (text.includes("DEBBUG:")) events.push({ text, loggedAt: Number(values[1]) });
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${appPort}/?page=2` });
  await waitUntil(() => events.some((event) => event.text.includes("ClientComponent mounting")), 90000, "the initial timeout route to mount");
  const warmup = await fetch(`http://127.0.0.1:${appPort}/api/data`);
  if (!warmup.ok) throw new Error(`API warmup failed with HTTP ${warmup.status}`);

  const transitionStart = Date.now();
  await cdp.send("Runtime.evaluate", {
    expression: `(() => { const link = document.querySelector('a[href="/?page=1"]'); if (!link) throw new Error('fetch link missing'); link.click(); })()`,
    awaitPromise: true,
  });
  await waitUntil(() => events.some((event) => event.loggedAt >= transitionStart && event.text.includes("SuspenseComponent unmounting")), 90000, "the fetch route to resolve Suspense");

  const transitionEvents = events.filter((event) => event.loggedAt >= transitionStart);
  const unmount = transitionEvents.find((event) => event.text.includes("SuspenseComponent unmounting"));
  const renders = transitionEvents.filter((event) => event.text.includes("ClientComponent rendering") && event.loggedAt <= unmount.loggedAt);
  const render = renders.at(-1);
  if (!render || !Number.isFinite(render.loggedAt) || !Number.isFinite(unmount.loggedAt)) {
    throw new Error(`Required client timing logs were missing: ${JSON.stringify(transitionEvents)}`);
  }
  const delayMs = unmount.loggedAt - render.loggedAt;
  console.log(`Observed fetch transition: ClientComponent rendered at ${render.loggedAt}, fallback unmounted at ${unmount.loggedAt}, delay=${delayMs}ms`);
  console.log(`Transition events: ${JSON.stringify(transitionEvents)}`);
  finalCode = delayMs >= 150 ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  if (cdp) cdp.close();
  await terminate(chrome);
  await terminate(next);
  for (const child of [...children]) await terminate(child);
  if (profile) await rm(profile, { recursive: true, force: true });
}
