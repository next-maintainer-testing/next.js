import { spawn } from "node:child_process";
import process from "node:process";

const port = 32000 + (process.pid % 1000);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    logs += chunk.toString();
    if (logs.length > 20000) logs = logs.slice(-20000);
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadPage() {
  const deadline = Date.now() + 120000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})\n${logs}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const html = await response.text();
      if (response.ok && html.includes("data-next-version=")) return html;
      lastError = new Error(`HTTP ${response.status}: ${html.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for the rendered documentation: ${lastError}\n${logs}`);
}

async function stopChild() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (await Promise.race([exited.then(() => true), delay(10000).then(() => false)])) return;
  child.kill("SIGKILL");
  await exited;
}

let exitCode = 2;
try {
  const html = await loadPage();
  const installedVersion = (await import("next/package.json", { with: { type: "json" } })).default.version;
  if (!html.includes(`data-next-version="${installedVersion}"`)) {
    throw new Error(`Rendered page did not attest installed Next.js ${installedVersion}`);
  }

  const text = visibleText(html);
  const documentsStandalone = /output\s*:\s*['"]standalone['"]/i.test(text);
  const documentsExport = /output\s*:\s*['"]export['"]/i.test(text);
  if (!documentsStandalone) {
    throw new Error(`Reference page did not render the known standalone value: ${text.slice(0, 2000)}`);
  }

  if (documentsExport) {
    console.log(`ABSENT: Next.js ${installedVersion} rendered both output values, including output: 'export'.`);
    exitCode = 1;
  } else {
    console.log(`PRESENT: Next.js ${installedVersion} rendered output: 'standalone' but omitted output: 'export'.`);
    exitCode = 0;
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  console.error(logs);
  exitCode = 2;
} finally {
  process.exitCode = exitCode;
  await stopChild();
}
