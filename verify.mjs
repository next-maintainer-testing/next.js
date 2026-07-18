import { spawn } from "node:child_process";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}

  const closed = new Promise((resolve) => child.once("close", resolve));
  const result = await Promise.race([
    closed.then(() => "closed"),
    sleep(5000).then(() => "timeout"),
  ]);

  if (result === "timeout" && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await closed;
  }
}

async function main() {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  const collect = (chunk) => {
    output += chunk.toString();
    if (output.length > 200_000) output = output.slice(-200_000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  try {
    const deadline = Date.now() + 60_000;
    let rendered = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`next dev exited before rendering (code ${child.exitCode}, signal ${child.signalCode})`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        await response.arrayBuffer();
        rendered = true;
        break;
      } catch {
        await sleep(250);
      }
    }

    if (!rendered) throw new Error("next dev did not become reachable within 60 seconds");
    await sleep(3000);

    const reproduced =
      /unhandledRejection/i.test(output) &&
      /Only plain objects, and a few built-ins, can be passed to Client Components from Server Components/i.test(output);

    process.exitCode = reproduced ? 0 : 1;
    console.log(
      reproduced
        ? "REPRODUCED: server render logged an unhandledRejection for the non-serializable bound Server Action value"
        : "ABSENT: server render did not log the reported unhandledRejection",
    );
    console.log(output.slice(-8000));
  } finally {
    await stop(child);
  }
}

try {
  await main();
} catch (error) {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
}
