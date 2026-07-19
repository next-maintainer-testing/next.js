import { spawn } from "node:child_process";
import net from "node:net";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const workspace = new URL(".", import.meta.url).pathname;
let server;
let browser;
let resultCode = 2;
let serverOutput = "";

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Could not reserve a local port"));
      });
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped && server.exitCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}

try {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;

  server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspace,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12000);
    });
  }

  await waitForServer(origin, 120000);
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    headless: "shell",
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click("#masked-query-link");
  await page.waitForFunction(() => location.pathname === "/video-modern", { timeout: 60000 });
  await page.waitForSelector("#observed-search-param", { timeout: 60000 });

  const observation = await page.$eval("#observed-search-param", (element) => element.textContent?.trim());
  const finalUrl = page.url();
  if (observation === "MISSING") {
    console.log(`SYMPTOM_PRESENT: destination rendered MISSING after client navigation (${finalUrl})`);
    resultCode = 0;
  } else if (observation === "HomePage") {
    console.log(`SYMPTOM_ABSENT: destination preserved sourcePage=HomePage (${finalUrl})`);
    resultCode = 1;
  } else {
    throw new Error(`Unexpected destination observation ${JSON.stringify(observation)} at ${finalUrl}`);
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  if (serverOutput) console.error(serverOutput);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  await stopServer();
}
