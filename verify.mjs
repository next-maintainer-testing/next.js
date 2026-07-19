import { createServer } from "node:net";
import { spawn } from "node:child_process";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForNext(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      await response.arrayBuffer();
      return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Timed out waiting for Next.js");
}

let nextProcess;
let browser;
let output = "";
let resultCode = 2;

try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  nextProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-20_000);
    });
  }

  await waitForNext(baseUrl, nextProcess);
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
      });
    });
  });

  const response = await page.goto(`${baseUrl}/route-that-does-not-exist`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForFunction(() => document.body?.innerText.includes("404"), {
    timeout: 60_000,
  });
  await sleep(500);

  const observed = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1")].find(
      (element) => element.textContent.trim() === "404",
    );
    return {
      statusText: document.body.innerText.slice(0, 300),
      inlineStyle: heading?.getAttribute("style") ?? null,
      computedDisplay: heading ? getComputedStyle(heading).display : null,
      violations: window.__cspViolations,
    };
  });

  const styleViolation = observed.violations.some(
    (violation) =>
      violation.blockedURI === "inline" &&
      violation.effectiveDirective.startsWith("style-src"),
  );
  const builtIn404 = response?.status() === 404 && observed.inlineStyle?.includes("display:inline-block");
  const styleWasBlocked = observed.computedDisplay !== "inline-block";
  const symptomPresent = Boolean(builtIn404 && styleViolation && styleWasBlocked);

  console.log(JSON.stringify({
    symptomPresent,
    status: response?.status() ?? null,
    observed,
  }, null, 2));
  resultCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  if (output) console.error("Next.js output:\n" + output);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close().catch(() => {});
  if (nextProcess && nextProcess.exitCode === null) {
    nextProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => nextProcess.once("exit", resolve)),
      sleep(5_000),
    ]);
    if (nextProcess.exitCode === null) nextProcess.kill("SIGKILL");
  }
}
