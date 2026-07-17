import { spawn } from "node:child_process";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const port = 32137;
const origin = `http://127.0.0.1:${port}`;
let server;
let browser;
let finalCode = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(origin);
      if (response.status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Timed out waiting for next dev");
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(10_000),
  ]);
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await new Promise((resolve) => server.once("exit", resolve));
  }
}

try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  await waitForServer();

  const serverResponse = await fetch(origin);
  const serverHtml = await serverResponse.text();
  const serverRenderedUuid = /data-uuid="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/i.test(serverHtml);

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: "networkidle0", timeout: 120_000 });
  await sleep(2_000);

  const clientRandomUuidFailure = pageErrors.some((message) =>
    /randomUUID.*(?:not a function|is not a function)/i.test(message)
  );

  if (serverRenderedUuid && clientRandomUuidFailure) {
    console.log("SYMPTOM PRESENT: SSR emitted a UUID, but browser hydration threw because randomUUID is not a function.");
    console.log(`Browser errors: ${pageErrors.join(" | ")}`);
    finalCode = 0;
  } else {
    console.log("SYMPTOM ABSENT: the reported SSR-success/browser-failure combination was not observed.");
    console.log(`SSR UUID: ${serverRenderedUuid}; browser errors: ${pageErrors.join(" | ") || "none"}`);
    finalCode = 1;
  }
} catch (error) {
  console.error("CHECK FAILED:", error?.stack || error);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  if (browser) await browser.close();
  await stopServer();
}
