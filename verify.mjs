import { spawn } from "node:child_process";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import process from "node:process";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const cwd = new URL("./", import.meta.url);
let server;
let resultCode = 2;
let logs = "";

function appendLog(chunk) {
  logs = (logs + chunk.toString()).slice(-20000);
}

async function runBuild() {
  rmSync(new URL("./.next/", import.meta.url), { recursive: true, force: true });
  const build = spawn(process.execPath, [nextBin, "build"], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  build.stdout.on("data", appendLog);
  build.stderr.on("data", appendLog);
  const [code, signal] = await once(build, "exit");
  if (code !== 0) throw new Error(`Next.js build failed with code ${code} signal ${signal}\n${logs}`);
}

async function allocatePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => socket.close(resolve));
  if (!port) throw new Error("Could not allocate a port");
  return port;
}

async function request(url, timeout = 15000) {
  return fetch(url, { signal: AbortSignal.timeout(timeout) });
}

async function waitForPage(origin) {
  const deadline = Date.now() + 120000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early with ${server.exitCode}\n${logs}`);
    try {
      const response = await request(origin);
      if (response.ok) return response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError}\n${logs}`);
}

function backgrounds(css, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`\\.${escaped}(?=[\\s.{:#>+~,])[^{}]*\\{([^{}]*)\\}`, "g");
  const values = [];
  for (const match of css.matchAll(rule)) {
    const value = match[1].match(/background-color\s*:\s*([^;!}]+?)(?:\s*!important)?\s*(?:;|$)/i)?.[1];
    if (value) values.push({ color: value.trim().toLowerCase(), offset: match.index });
  }
  return values;
}

async function stylesFromPage(html, origin) {
  const styles = [];
  for (const match of html.matchAll(/<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    const tag = match[0];
    if (/^<style\b/i.test(tag)) {
      styles.push(tag.replace(/^<style\b[^>]*>/i, "").replace(/<\/style>$/i, ""));
      continue;
    }
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const response = await request(new URL(href.replaceAll("&amp;", "&"), origin));
    if (!response.ok) throw new Error(`Failed to fetch stylesheet ${href}: HTTP ${response.status}`);
    styles.push(await response.text());
  }
  if (!styles.length) throw new Error("Rendered page did not contain stylesheets");
  return styles;
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
  await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 10000))]);
  if (server.exitCode === null) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); }
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
}

try {
  await runBuild();
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", appendLog);
  server.stderr.on("data", appendLog);

  const html = await waitForPage(origin);
  const button = html.match(/<button\b[^>]*class=["']([^"']+)["'][^>]*>[^<]*I should be blue ![^<]*<\/button>/i);
  if (!button) throw new Error("Could not find rendered reproduction button");
  const classes = button[1].split(/\s+/).filter(Boolean);
  const styles = await stylesFromPage(html, origin);
  const cascade = [];
  for (let sheetIndex = 0; sheetIndex < styles.length; sheetIndex++) {
    for (const className of classes) {
      for (const declaration of backgrounds(styles[sheetIndex], className)) cascade.push({ sheetIndex, className, ...declaration });
    }
  }
  cascade.sort((a, b) => a.sheetIndex - b.sheetIndex || a.offset - b.offset);
  const colors = cascade.map(({ color }) => color);
  if (!colors.includes("red") || !colors.includes("blue")) throw new Error(`Did not observe red and blue declarations: ${JSON.stringify(cascade)}`);
  const computedBackground = cascade.at(-1).color;
  console.log(JSON.stringify({ classes, cascade, computedBackground }));
  if (computedBackground === "red") {
    console.log("SYMPTOM_PRESENT: dependency CSS wins and the rendered button background is red");
    resultCode = 0;
  } else if (computedBackground === "blue") {
    console.log("SYMPTOM_ABSENT: local app CSS wins and the rendered button background is blue");
    resultCode = 1;
  } else {
    throw new Error(`Unexpected final background: ${computedBackground}`);
  }
} catch (error) {
  console.error(error?.stack || error);
  if (logs) console.error(logs);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  await stopServer();
}
