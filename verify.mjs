import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";

const cwd = process.cwd();
const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const nextEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
let nextServer = null;
let browser = null;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: nextEnv });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

async function getPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js server did not become ready: ${lastError}`);
}

async function findBrowserExecutable() {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  let entries = [];
  try {
    entries = await fs.readdir(cache);
  } catch {}
  entries.sort().reverse();

  for (const entry of entries) {
    if (!entry.startsWith("chromium_headless_shell-")) continue;
    const executable = path.join(cache, entry, "chrome-headless-shell-linux64", "chrome-headless-shell");
    try {
      await fs.access(executable);
      return executable;
    } catch {}
  }
  for (const entry of entries) {
    if (!entry.startsWith("chromium-")) continue;
    for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const executable = path.join(cache, entry, relative);
      try {
        await fs.access(executable);
        return executable;
      } catch {}
    }
  }
  throw new Error("No Playwright Chromium executable is available");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

try {
  await fs.rm(path.join(cwd, ".next"), { recursive: true, force: true });
  await run(process.execPath, [nextBin, "build"]);

  const manifest = JSON.parse(await fs.readFile(path.join(cwd, ".next", "prerender-manifest.json"), "utf8"));
  const commandRoute = manifest.routes?.["/command"];
  let staticPrefetch = null;
  if (commandRoute?.experimentalPPR && commandRoute.prefetchDataRoute) {
    const relative = commandRoute.prefetchDataRoute.replace(/^\//, "");
    const candidate = path.join(cwd, ".next", "server", "app", relative);
    try {
      await fs.access(candidate);
      staticPrefetch = candidate;
    } catch {}
  }

  const port = await getPort();
  nextServer = spawn(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd, stdio: "inherit", env: nextEnv },
  );
  await waitForServer(`http://127.0.0.1:${port}/`);

  browser = await chromium.launch({
    headless: true,
    executablePath: await findBrowserExecutable(),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  let servedDeploymentPrefetch = false;

  if (staticPrefetch) {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/command" && request.headers()["next-router-prefetch"] === "1") {
        servedDeploymentPrefetch = true;
        await route.fulfill({
          status: 200,
          contentType: "text/x-component",
          body: await fs.readFile(staticPrefetch),
        });
      } else {
        await route.continue();
      }
    });
  }

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(1500);

  const dialogCount = await page.locator('[role="dialog"]').count();
  const finalPath = new URL(page.url()).pathname;
  const symptomPresent = servedDeploymentPrefetch && dialogCount === 0 && finalPath === "/";
  console.log(JSON.stringify({ servedDeploymentPrefetch, dialogCount, finalPath, symptomPresent }));
  process.exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await stopChild(nextServer);
}
