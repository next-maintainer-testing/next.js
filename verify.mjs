import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-chromium";

process.exitCode = 2;

const root = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(path.join(root, "node_modules/next/package.json"), "utf8"));
const nextVersion = packageJson.version;
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "next-76074-"));
const appDir = path.join(temporaryRoot, "generated-app");
let browser;
let server;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output }));
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

async function waitForUrl(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([closed, delay(5000)]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await Promise.race([closed, delay(5000)]);
  }
}

try {
  console.log(`Generating the create-next-app template for ${nextVersion}`);
  const created = await run(
    "npx",
    [
      "--yes",
      `create-next-app@${nextVersion}`,
      appDir,
      "--js",
      "--tailwind",
      "--app",
      "--use-npm",
      "--no-eslint",
      "--no-src-dir",
      "--import-alias",
      "@/*",
      "--yes",
    ],
    temporaryRoot,
  );
  if (created.code !== 0) {
    throw new Error(`create-next-app failed with code ${created.code ?? created.signal}`);
  }

  await writeFile(
    path.join(appDir, "app/page.js"),
    'export default function Page() {\n  return <span id="target" className="font-mono">Hello, world!</span>;\n}\n',
  );

  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const nextBin = path.join(appDir, "node_modules/next/dist/bin/next");
  server = spawn(process.execPath, [nextBin, "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appDir,
    detached: true,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);
  await waitForUrl(url, server, 120000);

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  const observation = await page.locator("#target").evaluate((target) => {
    const reference = document.createElement("span");
    reference.textContent = "reference";
    reference.style.fontFamily = "var(--font-geist-mono)";
    target.after(reference);
    const targetStyle = getComputedStyle(target);
    const referenceStyle = getComputedStyle(reference);
    return {
      sourceVariable: targetStyle.getPropertyValue("--font-geist-mono").trim(),
      aliasVariable: targetStyle.getPropertyValue("--font-mono").trim(),
      targetFontFamily: targetStyle.fontFamily,
      referenceFontFamily: referenceStyle.fontFamily,
    };
  });
  console.log(`OBSERVATION ${JSON.stringify(observation)}`);

  if (!observation.sourceVariable) {
    throw new Error("The generated template did not expose --font-geist-mono on the target");
  }
  const symptomPresent = observation.targetFontFamily !== observation.referenceFontFamily;
  console.log(symptomPresent ? "SYMPTOM_PRESENT" : "SYMPTOM_ABSENT");
  process.exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await stopServer(server);
  await rm(temporaryRoot, { recursive: true, force: true });
}
