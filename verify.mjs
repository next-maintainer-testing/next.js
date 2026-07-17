import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rm } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const cwd = new URL(".", import.meta.url).pathname;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
let server;
let browser;
let resultCode = 2;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready at ${url}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill("SIGKILL");
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

try {
  await rm(new URL(".next", import.meta.url), { recursive: true, force: true });
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);

  const port = await freePort();
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd, env, stdio: "inherit" }
  );
  server.once("error", (error) => console.error(error));

  const origin = `http://127.0.0.1:${port}`;
  await waitForServer(`${origin}/app`);
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: "shell",
    args: chromium.args,
  });
  const page = await browser.newPage();
  await page.goto(`${origin}/app`, { waitUntil: "networkidle0" });
  await page.click("#navigate");

  const deadline = Date.now() + 10_000;
  let pathname = new URL(page.url()).pathname;
  while (pathname === "/app" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    pathname = new URL(page.url()).pathname;
  }

  console.log(`Observed browser pathname: ${pathname}`);
  if (pathname === "/app/app/cars/11841") {
    resultCode = 0;
  } else if (pathname === "/app/cars/11841") {
    resultCode = 1;
  } else {
    throw new Error(`unexpected pathname ${pathname}`);
  }
  process.exitCode = resultCode;
} catch (error) {
  console.error(error);
  resultCode = 2;
  process.exitCode = resultCode;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  await stopServer();
}
