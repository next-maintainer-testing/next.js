import { spawn } from "node:child_process";
import net from "node:net";

const expected =
  "Attempted to call a temporary Client Reference from the server but it is on the client";
const host = "127.0.0.1";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const port = await reservePort();
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--hostname", host, "--port", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
let closed = false;
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});
child.once("close", () => {
  closed = true;
});

let responseText = "";
let responseReceived = false;
const deadline = Date.now() + 90_000;

try {
  while (Date.now() < deadline && !closed) {
    try {
      const response = await fetch(`http://${host}:${port}/?foo=bar`);
      responseText = await response.text();
      responseReceived = true;
      break;
    } catch {
      await delay(500);
    }
  }

  if (responseReceived) {
    await delay(2_000);
  }

  const evidence = `${output}\n${responseText}`;
  if (!responseReceived) {
    console.error("Verification failed: the development server never responded.");
    process.exitCode = 2;
  } else if (evidence.includes(expected)) {
    console.log("VERIFIED: the confusing temporary Client Reference error occurred in a use cache scope.");
    process.exitCode = 0;
  } else {
    console.log("NOT REPRODUCED: the reported temporary Client Reference error was absent.");
    process.exitCode = 1;
  }
} finally {
  if (!closed) {
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch {}

    await Promise.race([
      new Promise((resolve) => child.once("close", resolve)),
      delay(5_000),
    ]);
  }
}
