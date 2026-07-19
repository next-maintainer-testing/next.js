import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

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

async function waitFor(fn, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

async function findBrowser() {
  const explicit = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const path of explicit) {
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {}
  }

  const cache = join(homedir(), ".cache", "ms-playwright");
  const candidates = [];
  async function scan(dir, depth = 0) {
    if (depth > 3) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path, depth + 1);
      else if (["chrome", "headless_shell"].includes(entry.name)) candidates.push(path);
    }
  }
  await scan(cache);
  if (candidates.length) return candidates.sort().at(-1);
  throw new Error("No Chromium executable is available for the browser-level focus check");
}

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-12_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.output = () => output;
  child.label = label;
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000),
  ]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2_000),
    ]);
  }
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("DevTools WebSocket failed to open")), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    }
    return result.result.value;
  }

  async close() {
    if (this.ws.readyState < WebSocket.CLOSING) this.ws.close();
    if (this.ws.readyState !== WebSocket.CLOSED) {
      await Promise.race([
        new Promise((resolve) => this.ws.addEventListener("close", resolve, { once: true })),
        sleep(1_000),
      ]);
    }
  }
}

let nextProcess;
let browserProcess;
let cdp;
let profile;
let resultCode = 2;

try {
  const appPort = await freePort();
  const debugPort = await freePort();
  const browser = await findBrowser();
  profile = await mkdtemp(join(tmpdir(), "next-link-focus-"));

  nextProcess = start(
    process.execPath,
    [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "-p", String(appPort)],
    "Next.js",
  );
  nextProcess.once("exit", (code) => {
    if (code && resultCode === 2) console.error(`Next.js exited early (${code})\n${nextProcess.output()}`);
  });

  const appUrl = `http://127.0.0.1:${appPort}`;
  await waitFor(async () => {
    const response = await fetch(appUrl);
    return response.ok;
  }, "Next.js dev server");

  browserProcess = start(browser, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    appUrl,
  ], "Chromium");

  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    return targets.find((entry) => entry.type === "page" && entry.url.startsWith(appUrl));
  }, "Chromium page target");

  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  await waitFor(() => cdp.evaluate(`document.readyState === "complete" && document.querySelector("h1")?.textContent === "Home page"`), "home page render");
  const point = await cdp.evaluate(`(() => {
    const link = [...document.querySelectorAll("a")].find((element) => element.textContent === "About");
    if (!link) return null;
    const rect = link.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error("Could not locate the About link");

  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });

  await waitFor(() => cdp.evaluate(`location.pathname === "/about" && document.querySelector("h1")?.textContent === "About page"`), "client-side navigation to /about");
  await sleep(500);

  const observation = await cdp.evaluate(`(() => {
    const active = document.activeElement;
    return {
      pathname: location.pathname,
      heading: document.querySelector("h1")?.textContent ?? null,
      activeTag: active?.tagName ?? null,
      activeText: active?.textContent?.trim() ?? null,
      activeHref: active instanceof HTMLAnchorElement ? active.getAttribute("href") : null,
      focusVisible: active?.matches?.(":focus") ?? false,
    };
  })()`);

  const symptomPresent = observation.pathname === "/about" &&
    observation.heading === "About page" &&
    observation.activeTag === "A" &&
    observation.activeText === "About" &&
    observation.activeHref === "/about" &&
    observation.focusVisible === true;

  console.log(JSON.stringify({ symptom: "clicked next/link remains focused after navigation", symptomPresent, observation }));
  resultCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  if (nextProcess) console.error(`Next.js output:\n${nextProcess.output()}`);
  if (browserProcess) console.error(`Chromium output:\n${browserProcess.output()}`);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (cdp) await cdp.close();
  await stop(browserProcess);
  await stop(nextProcess);
  if (profile) await rm(profile, { recursive: true, force: true });
}
