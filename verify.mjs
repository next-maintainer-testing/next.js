import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

const require = createRequire(import.meta.url);

async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  if (!port) throw new Error("Could not reserve a local port");
  return port;
}

async function waitForHtml(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ?? "no response"}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

let server;
try {
  const port = await reservePort();
  const nextBin = require.resolve("next/dist/bin/next");
  server = spawn(
    process.execPath,
    [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } },
  );

  const html = await waitForHtml(`http://127.0.0.1:${port}/`, server, 60000);
  const preloadTags = html.match(/<link\b[^>]*\brel=["']preload["'][^>]*>/gi) ?? [];
  const fontPreloads = preloadTags.filter((tag) => /\bas=["']font["']/i.test(tag));

  if (fontPreloads.length === 0) {
    console.log("SYMPTOM PRESENT: next dev initial HTML contains no font preload link");
    process.exitCode = 0;
  } else {
    console.log(`SYMPTOM ABSENT: next dev initial HTML contains ${fontPreloads.length} font preload link(s)`);
    for (const tag of fontPreloads) console.log(tag);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("CHECK FAILED:", error);
  process.exitCode = 2;
} finally {
  if (server) await stop(server);
}
