import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 38117;
const url = `http://127.0.0.1:${port}/example5/bar`;
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: new URL(".", import.meta.url).pathname,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
server.stdout.on("data", (chunk) => {
  logs += chunk;
  process.stdout.write(chunk);
});
server.stderr.on("data", (chunk) => {
  logs += chunk;
  process.stderr.write(chunk);
});

let outcome = 2;
try {
  const deadline = Date.now() + 120_000;
  let response;
  let body = "";

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${server.exitCode})`);
    }

    try {
      response = await fetch(url);
      body = await response.text();
      if (response.ok) break;
      if (response.status >= 500) {
        throw new Error(`Page returned HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
    } catch (error) {
      if (Date.now() + 500 >= deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!response?.ok) throw new Error("Timed out waiting for the reproduction page");

  const symptomPresent = body.includes('data-result="children|bar"');
  const hookRendered = body.includes('id="segments"');
  if (!hookRendered) throw new Error("The hook result marker was not rendered");

  console.log(`Observed ${symptomPresent ? '["children","bar"]' : "a result without the children prefix"} at ${url}`);
  outcome = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(logs.slice(-2000));
  outcome = 2;
} finally {
  process.exitCode = outcome;
  if (server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  if (server.exitCode === null) {
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
  }
  if (server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {}
    await once(server, "exit").catch(() => {});
  }
}
