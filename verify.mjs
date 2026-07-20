import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import net from "node:net";

const EXPECTED = "SERVER_ACTION_ID:captured-id-74961";
const deadline = Date.now() + 240_000;
let output = "";
let child;
let result = 2;
let observation = "check did not complete";

function record(chunk) {
  output += chunk.toString();
  if (output.length > 200_000) output = output.slice(-200_000);
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

async function getPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPage(url) {
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`dev server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`GET returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("timed out waiting for the page");
}

function actionBody(html) {
  const formHtml = html.match(/<form[\s\S]*?<\/form>/)?.[0];
  if (!formHtml) throw new Error("rendered page did not contain the action form");
  const body = new FormData();
  for (const input of formHtml.match(/<input[^>]*>/g) ?? []) {
    const name = input.match(/name="([^"]*)"/)?.[1];
    const encodedValue = input.match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) body.append(name, decodeHtml(encodedValue));
  }
  if (![...body.keys()].some((name) => name.startsWith("$ACTION_"))) {
    throw new Error("rendered form did not contain a server action reference");
  }
  return body;
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await closed;
  }
}

try {
  await rm(".next", { recursive: true, force: true });
  const port = await getPort();
  const url = `http://127.0.0.1:${port}/`;
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  const html = await waitForPage(url);
  const response = await fetch(url, {
    method: "POST",
    body: actionBody(html),
    headers: { origin: url.slice(0, -1), referer: url },
  });
  await response.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const hasReferenceError = /ReferenceError:\s*id is not defined/.test(output);
  const loggedExpectedValue = output.includes(EXPECTED);
  if (hasReferenceError && response.status >= 500) {
    result = 0;
    observation = `symptom present: POST ${response.status}; server threw ReferenceError: id is not defined`;
  } else if (loggedExpectedValue && response.status < 500) {
    result = 1;
    observation = `symptom absent: POST ${response.status}; server logged ${EXPECTED}`;
  } else {
    observation = `check failed: POST ${response.status}; expected neither conclusive error nor success marker`;
  }
} catch (error) {
  observation = `check failed: ${error?.stack ?? error}`;
  result = 2;
} finally {
  process.exitCode = result;
  await stopServer();
  console.log(observation);
  if (result === 2) console.error(output.slice(-8_000));
}
