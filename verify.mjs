import { spawn } from "node:child_process";

const port = 32000 + (process.pid % 1000);
let server;
let timeout;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        output += text;
        destination.write(text);
      });
    }
    child.on("error", (error) => resolve({ code: null, output, error }));
    child.on("close", (code, signal) => resolve({ code, signal, output }));
  });
}

function waitForReady(child, getOutput) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (/Ready in|✓ Ready/.test(getOutput())) return resolve();
      if (child.exitCode !== null) return reject(new Error(`next start exited with ${child.exitCode}`));
      if (Date.now() - started > 30_000) return reject(new Error("next start did not become ready"));
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const force = setTimeout(() => {
      if (server.exitCode === null) server.kill("SIGKILL");
    }, 5_000);
    server.once("close", () => {
      clearTimeout(force);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

async function main() {
  timeout = setTimeout(() => {
    process.stderr.write("Verification timed out\n");
    process.exitCode = 2;
    if (server?.exitCode === null) server.kill("SIGTERM");
  }, 240_000);

  const nextBin = process.platform === "win32" ? "node_modules/.bin/next.cmd" : "node_modules/.bin/next";
  const build = await run(nextBin, ["build", "--turbopack"]);
  if (build.code !== 0) {
    process.stderr.write(`Build failed (exit ${build.code})\n`);
    process.exitCode = 2;
    return;
  }

  let serverOutput = "";
  server = spawn(nextBin, ["start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const [stream, destination] of [
    [server.stdout, process.stdout],
    [server.stderr, process.stderr],
  ]) {
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      serverOutput += text;
      destination.write(text);
    });
  }

  await waitForReady(server, () => serverOutput);
  let status;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    status = response.status;
    await response.text();
  } catch (error) {
    process.stderr.write(`Request error: ${error.message}\n`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  const symptomPresent =
    serverOutput.includes("ERR_MODULE_NOT_FOUND") &&
    /Cannot find module ['\"][^'\"]*[\\/]\.next[\\/]cache-handler\.mjs['\"]/.test(serverOutput);

  if (symptomPresent) {
    process.stdout.write(`SYMPTOM_PRESENT: request returned ${status ?? "no response"}; next start could not load .next/cache-handler.mjs\n`);
    process.exitCode = 0;
  } else {
    process.stdout.write(`SYMPTOM_ABSENT: request returned ${status ?? "no response"}; missing cache handler error was not emitted\n`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Verification failed: ${error.stack ?? error}\n`);
  process.exitCode = 2;
} finally {
  clearTimeout(timeout);
  await stopServer();
}
