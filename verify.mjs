import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname);
let browser;
let browserExited;
let socket;
let server;
let userDataDir;

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} failed (${code ?? signal})`));
    });
  });
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }

  const roots = [join(process.env.HOME || "/root", ".cache", "ms-playwright")];
  for (const searchRoot of roots) {
    try {
      const versions = await readdir(searchRoot);
      for (const version of versions.sort().reverse()) {
        for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
          const candidate = join(searchRoot, version, relative);
          try {
            if ((await stat(candidate)).isFile()) return candidate;
          } catch {}
        }
      }
    } catch {}
  }

  throw new Error("No Chromium executable is available for the browser rendering check");
}

async function freePort() {
  const probe = createNetServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = probe.address();
  await new Promise((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

function contentType(pathname) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  }[extname(pathname)] || "application/octet-stream";
}

async function startExportServer() {
  const outDir = join(root, "out");
  const httpServer = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const file = resolve(outDir, requested);
      if (file !== outDir && !file.startsWith(outDir + sep)) throw new Error("invalid path");
      const body = await readFile(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise((resolveListen, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  return httpServer;
}

async function waitForDebugger(port) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Chromium debugger did not become ready: ${lastError || "no page target"}`);
}

async function connectCdp(url) {
  const ws = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener("open", resolveOpen, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  return {
    ws,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolveSend, reject) => {
        pending.set(id, { resolve: resolveSend, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function renderedStyle(cdp, url) {
  await cdp.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        if (document.readyState !== "complete") return null;
        const probe = document.getElementById("probe");
        if (!probe) return null;
        const style = getComputedStyle(probe);
        return {
          backgroundColor: style.backgroundColor,
          display: style.display,
          borderRadius: style.borderRadius,
          styleSheetCount: document.styleSheets.length,
          url: location.href
        };
      })()`,
      returnByValue: true,
    });
    if (result.result.value) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      const settled = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const style = getComputedStyle(document.getElementById("probe"));
          return {
            backgroundColor: style.backgroundColor,
            display: style.display,
            borderRadius: style.borderRadius,
            styleSheetCount: document.styleSheets.length,
            url: location.href
          };
        })()`,
        returnByValue: true,
      });
      return settled.result.value;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Page did not finish rendering: ${url}`);
}

try {
  if (typeof WebSocket !== "function") {
    throw new Error(`This check requires Node.js with global WebSocket support; found ${process.version}`);
  }

  await rm(join(root, ".next"), { recursive: true, force: true });
  await rm(join(root, "out"), { recursive: true, force: true });
  await run("npm", ["run", "build"]);

  server = await startExportServer();
  const httpPort = server.address().port;
  const debugPort = await freePort();
  const chrome = await findChrome();
  userDataDir = await mkdtemp(join(tmpdir(), "issue-64961-chrome-"));
  browser = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserError = "";
  browser.stderr.on("data", (chunk) => { browserError += chunk; });
  browserExited = new Promise((resolveExit) => browser.once("exit", resolveExit));

  const debuggerUrl = await waitForDebugger(debugPort);
  const cdp = await connectCdp(debuggerUrl);
  socket = cdp.ws;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const httpStyle = await renderedStyle(cdp, `http://127.0.0.1:${httpPort}/`);
  const expected = httpStyle.backgroundColor === "rgb(12, 34, 56)" &&
    httpStyle.display === "grid" && httpStyle.borderRadius === "18px";
  if (!expected) {
    throw new Error(`Control page was not styled over HTTP: ${JSON.stringify(httpStyle)} ${browserError}`);
  }

  const fileUrl = pathToFileURL(join(root, "out", "index.html")).href;
  const fileStyle = await renderedStyle(cdp, fileUrl);
  const stylingLost = fileStyle.backgroundColor !== "rgb(12, 34, 56)" &&
    fileStyle.display !== "grid" && fileStyle.borderRadius !== "18px";

  console.log(JSON.stringify({ httpStyle, fileStyle, stylingLost }, null, 2));
  process.exitCode = stylingLost ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  if (socket && socket.readyState < 2) socket.close();
  if (browser && browser.exitCode === null) browser.kill("SIGTERM");
  if (browserExited) await browserExited;
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
}
