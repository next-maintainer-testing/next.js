import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";

const host = "127.0.0.1";
const port = 32170;
const url = `http://${host}:${port}/test`;
let output = "";
let child;
let result = 2;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function portReady() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

try {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !(await portReady())) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before startup (${child.exitCode})`);
    await delay(250);
  }
  if (!(await portReady())) throw new Error("Timed out waiting for Next.js");

  await fetch(url, { redirect: "manual" });
  await delay(1500);

  const hasRoute = output.includes('Route "/test"');
  const hasBlockingError = output.includes("Uncached data was accessed outside of <Suspense>");
  const hasDocumentationLink = output.includes("nextjs.org/docs/messages/blocking-route");
  result = hasRoute && hasBlockingError && hasDocumentationLink ? 0 : 1;
  console.log(result === 0 ? "REPRODUCED: blocking-route error reported for /test" : "NOT REPRODUCED: blocking-route error absent for /test");
  if (result !== 0) console.log(output);
} catch (error) {
  console.error("VERIFY_FAILED:", error);
  console.error(output);
  result = 2;
} finally {
  process.exitCode = result;
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(10_000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
}
