import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";

const host = "127.0.0.1";
let child;
let output = "";

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Timed out waiting for the Next.js development server");
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    sleep(10000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
  if (child.exitCode === null) await once(child, "exit");
}

try {
  const port = await reservePort();
  const nextBin = resolve("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  child = spawn(nextBin, ["dev", "--hostname", host, "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-20000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-20000); });

  const origin = `http://${host}:${port}`;
  await waitForServer(`${origin}/`, 120000);
  const response = await fetch(`${origin}/oops`, { signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  const bodyStart = html.indexOf("<body");
  const renderedBody = bodyStart >= 0 ? html.slice(bodyStart) : "";
  const bodyStyleBlocks = [...renderedBody.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const leakingStyle = bodyStyleBlocks.find((css) =>
    /body\s*\{[^}]*color\s*:\s*(?:#000|black)[^}]*background\s*:\s*(?:#fff|white)[^}]*margin\s*:\s*0(?:[;}])/i.test(css)
  );
  const customLayoutRendered = renderedBody.includes("<header><h1>Header</h1></header>") && renderedBody.includes("<footer><h1>Footer</h1></footer>");
  const symptomPresent = response.status === 404 && customLayoutRendered && Boolean(leakingStyle);

  console.log(JSON.stringify({
    status: response.status,
    customLayoutRendered,
    injectedBodyErrorStyle: Boolean(leakingStyle),
    observation: symptomPresent
      ? "The runtime 404 response injects Next.js error CSS targeting body inside the rendered custom layout."
      : "The runtime 404 response does not inject the reported Next.js error CSS targeting body inside the custom layout."
  }));
  process.exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (output) console.error(output);
  process.exitCode = 2;
} finally {
  await stopServer();
}
