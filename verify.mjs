import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const deadlineMs = 180_000;
let child;
let logs = "";

function appendLog(chunk) {
  logs += chunk.toString();
  if (logs.length > 20_000) logs = logs.slice(-20_000);
}

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function openingTag(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<div(?=[^>]*\\bid=["']${escaped}["'])[^>]*>`, "i"))?.[0];
}

function classValue(tag) {
  return tag.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? null;
}

async function main() {
  const port = await reservePort();
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  const started = Date.now();
  let response;
  while (Date.now() - started < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before responding (code ${child.exitCode}).\n${logs}`);
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!response) throw new Error(`Timed out waiting for Next.js.\n${logs}`);

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Next.js returned HTTP ${response.status}.\n${html.slice(0, 4000)}\n${logs}`);
  }

  const baselineTag = openingTag(html, "baseline");
  const targetTag = openingTag(html, "target");
  if (!baselineTag || !targetTag) {
    throw new Error(`Expected rendered elements were not found.\n${html.slice(0, 4000)}`);
  }

  const baselineClass = classValue(baselineTag);
  const targetClass = classValue(targetTag);
  if (!baselineClass) {
    throw new Error(`The baseline CSS Module class was not emitted: ${baselineTag}`);
  }

  const symptomPresent = targetClass === null || targetClass === "" || targetClass === "undefined";
  process.exitCode = symptomPresent ? 0 : 1;
  console.log(JSON.stringify({
    symptomPresent,
    baselineTag,
    targetTag,
    observation: symptomPresent
      ? "The rendered target has no usable CSS Module class for styles.largeDescription."
      : "The rendered target has a CSS Module class for styles.largeDescription.",
  }));
}

try {
  await main();
} catch (error) {
  process.exitCode = 2;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  await stopChild();
}
