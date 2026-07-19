import { spawn } from "node:child_process";

const port = 30000 + (process.pid % 10000);
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
let output = "";
let childClosed = false;

const child = spawn(process.execPath, [nextBin, "dev", "--turbopack", "-p", String(port)], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CI: "1" },
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});

const append = (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
};
child.stdout.on("data", append);
child.stderr.on("data", append);
const closed = new Promise((resolve) => {
  child.once("close", (code, signal) => {
    childClosed = true;
    resolve({ code, signal });
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(100);
  }
  return predicate();
}

async function stopServer() {
  if (childClosed) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
  if (await Promise.race([closed.then(() => true), sleep(10000).then(() => false)])) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {}
  await closed;
}

let result = 2;
let detail = "Next.js development server did not produce a conclusive result";
try {
  const ready = await waitFor(
    () => /(?:Ready in|Local:\s+http)/i.test(output) || childClosed,
    90000,
  );

  let response;
  let body = "";
  if (ready && !childClosed) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(90000),
      });
      body = await response.text();
    } catch (error) {
      detail = `Page request failed: ${error.message}`;
    }
    await waitFor(
      () => /Export renderMathInElement (?:doesn't|was not) (?:exist|found)/i.test(output),
      5000,
    );
  }

  const symptom =
    /Export renderMathInElement (?:doesn't|was not) (?:exist|found)/i.test(output) &&
    /mathlive-ssr(?:\.min)?\.mjs/i.test(output);

  if (symptom) {
    result = 0;
    detail = "Turbopack rejected renderMathInElement after resolving mathlive's node/SSR export";
  } else if (response?.ok && /MathLive conditional export reproduction/.test(body)) {
    result = 1;
    detail = "The route compiled and returned successfully without the conditional-export error";
  } else if (childClosed) {
    const status = await closed;
    detail = `Next.js exited before a conclusive page response (code=${status.code}, signal=${status.signal})`;
  } else if (response) {
    detail = `The route returned HTTP ${response.status} without the reported diagnostic`;
  }
} catch (error) {
  detail = `Verification failed: ${error.stack || error}`;
} finally {
  process.exitCode = result;
  console.log(`\nVERIFY: ${detail}`);
  await stopServer();
}
