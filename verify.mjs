import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";

const host = "127.0.0.1";
const port = 3137;
const origin = `http://${host}:${port}`;
const nextPackage = JSON.parse(
  await readFile(new URL("./node_modules/next/package.json", import.meta.url), "utf8"),
);
const major = Number.parseInt(nextPackage.version.split(".")[0], 10);
const args = ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", String(port)];
if (major >= 16) args.push("--webpack");

let logs = "";
let child;
let result = 2;
let observation = "verification did not complete";

function appendLog(chunk) {
  logs = (logs + chunk.toString()).slice(-30000);
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  return { response, text };
}

async function stopServer() {
  if (!child) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

try {
  child = spawn(process.execPath, args, {
    cwd: new URL(".", import.meta.url),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  const deadline = Date.now() + 180000;
  let page;
  let lastError;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const fetched = await fetchText(`${origin}/`, {
        headers: { cookie: "RENDER_MOMENT=1; RENDER_JQUERY=0" },
      });
      if (fetched.response.status === 200) {
        page = fetched.text;
        break;
      }
      lastError = new Error(`route returned HTTP ${fetched.response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!page) {
    throw new Error(`unable to load rendered route: ${lastError?.message ?? "dev server exited"}`);
  }

  const momentRendered = page.includes("Client component (With moment)");
  const jqueryRendered = page.includes("Client component (With jquery)");
  if (!momentRendered || jqueryRendered) {
    throw new Error(
      `unexpected rendered state (momentRendered=${momentRendered}, jqueryRendered=${jqueryRendered})`,
    );
  }

  const scriptUrls = [...page.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(
    (match) => new URL(match[1], origin).href,
  );
  if (scriptUrls.length === 0) throw new Error("rendered route referenced no external scripts");

  const assets = [];
  for (const url of scriptUrls) {
    const fetched = await fetchText(url);
    if (!fetched.response.ok) {
      throw new Error(`script fetch failed with HTTP ${fetched.response.status}: ${url}`);
    }
    assets.push({
      url,
      bytes: Buffer.byteLength(fetched.text),
      moment: fetched.text.includes("MOMENT_CC_FINGERPRINT"),
      jquery: fetched.text.includes("JQUERY_CC_FINGERPRINT"),
    });
  }

  const momentDelivered = assets.some((asset) => asset.moment);
  const jqueryDelivered = assets.some((asset) => asset.jquery);
  const sharedChunk = assets.find((asset) => asset.moment && asset.jquery);

  if (!momentDelivered) {
    throw new Error("rendered moment client component was absent from downloaded route scripts");
  }

  if (jqueryDelivered) {
    result = 0;
    observation =
      `symptom present on Next.js ${nextPackage.version}: the HTML rendered only the moment client component, ` +
      `but its ${assets.length} downloaded route scripts also contained the unrendered jquery client fingerprint` +
      `${sharedChunk ? ` (both fingerprints shared ${new URL(sharedChunk.url).pathname}, ${sharedChunk.bytes} bytes)` : ""}`;
  } else {
    result = 1;
    observation =
      `symptom absent on Next.js ${nextPackage.version}: the HTML rendered only the moment client component, ` +
      `and none of its ${assets.length} downloaded route scripts contained the unrendered jquery client fingerprint`;
  }
} catch (error) {
  result = 2;
  observation = `check failed on Next.js ${nextPackage.version}: ${error.stack ?? error}`;
} finally {
  process.exitCode = result;
  await stopServer();
  console.log(observation);
  if (result === 2) console.error(logs);
}
