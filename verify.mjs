import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await getFreePort();
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const closed = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
let output = "";
let finishing = false;
let readyTimer;

function normalized(text) {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

async function stopChild() {
  if (child.exitCode !== null || child.signalCode !== null) {
    await closed;
    return;
  }
  child.kill("SIGTERM");
  const terminated = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000))
  ]);
  if (!terminated && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await closed;
  }
}

async function finish(exitCode, reason) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeout);
  clearTimeout(readyTimer);
  process.exitCode = exitCode;
  console.log(reason);
  const clean = normalized(output);
  console.log(clean.slice(Math.max(0, clean.length - 12000)));
  await stopChild();
}

function inspect() {
  const clean = normalized(output);
  const missingGraphql = /Module not found: Can't resolve 'graphql\/(?:language\/(?:printer|visitor)|utilities)'/.test(clean);
  const edgeInstrumentation = /Edge Instrumentation:|instrumentation Edge/.test(clean);
  const ddTraceImport = /dd-trace|instrumentation\.ts/.test(clean);

  if (missingGraphql && edgeInstrumentation && ddTraceImport) {
    void finish(0, "REPRODUCED: Edge instrumentation compilation emitted the reported dd-trace missing-GraphQL-module error.");
    return;
  }

  if (!readyTimer && /(?:✓|\b) Ready in\b/.test(clean)) {
    readyTimer = setTimeout(() => {
      void finish(1, "NOT REPRODUCED: next dev became ready without the reported Edge instrumentation module-resolution error.");
    }, 4000);
  }
}

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output += chunk;
    if (output.length > 500000) output = output.slice(-500000);
    inspect();
  });
}

child.once("error", (error) => {
  output += `\nFailed to start next dev: ${error.stack || error}\n`;
  void finish(2, "CHECK FAILED: next dev could not be started.");
});

child.once("close", (code, signal) => {
  if (!finishing) {
    void finish(2, `CHECK FAILED: next dev exited before a conclusive observation (code=${code}, signal=${signal}).`);
  }
});

const timeout = setTimeout(() => {
  void finish(2, "CHECK FAILED: timed out waiting for a conclusive next dev observation.");
}, 90000);
