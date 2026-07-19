import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
let output = "";
let child;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function request(port, { method = "GET", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        method,
        headers: { Host: `localhost:${port}`, Connection: "close", ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error("HTTP request timed out")));
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHome(port) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await request(port);
      if (response.status === 200) return response.body;
      lastError = new Error(`GET / returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready: ${lastError}`);
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 5000);
  await exited;
  clearTimeout(timer);
}

let resultCode = 2;
let observation = "check did not complete";

try {
  const port = await reservePort();
  child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: new URL(".", import.meta.url).pathname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const html = await waitForHome(port);
  const actionId = html.match(/\$ACTION_ID_([0-9a-f]+)/i)?.[1];
  if (!actionId) throw new Error("Could not find the rendered server action ID");

  const body = "[]";
  const response = await request(port, {
    method: "POST",
    headers: {
      Origin: `http://localhost:${port}`,
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      "Content-Length": Buffer.byteLength(body),
      "Next-Action": actionId,
      "Next-Router-State-Tree": '["",{"children":["__PAGE__",{}]},null,null,true]',
    },
    body,
  });

  for (let attempt = 0; attempt < 80 && !output.includes("PATH: '/blog'"); attempt++) {
    if (child.exitCode !== null) break;
    await delay(250);
  }

  const blogLines = output
    .split(/\r?\n/)
    .filter((line) => line.includes("PATH: '/blog'"));
  if (blogLines.length === 0) {
    throw new Error(`Redirect did not produce a middleware /blog observation (HTTP ${response.status})`);
  }

  const unexpectedHost = blogLines.some((line) =>
    line.includes(`HOST: '[::]:${port}'`),
  );
  resultCode = unexpectedHost ? 0 : 1;
  observation = unexpectedHost
    ? `symptom present: redirect middleware host changed from localhost:${port} to [::]:${port}`
    : `symptom absent: redirect middleware observations were ${blogLines.join(" | ")}`;
} catch (error) {
  resultCode = 2;
  observation = `check failure: ${error?.stack || error}`;
}

process.exitCode = resultCode;
console.log(`VERIFY_RESULT: ${observation}`);
await stopChild();
