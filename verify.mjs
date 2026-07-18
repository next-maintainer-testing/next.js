import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";

const cwd = fileURLToPath(new URL(".", import.meta.url));
let server;
let output = "";

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = typeof address === "object" && address ? address.port : null;
      socket.close((error) => (error || port === null ? reject(error) : resolve(port)));
    });
    socket.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`next start exited early with ${server.exitCode}\n${output}`);
    }
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`server did not become ready: ${lastError}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await new Promise((resolve) => server.once("exit", resolve));
  }
}

try {
  await rm(new URL(".next", import.meta.url), { recursive: true, force: true });
  const build = await run("npm", ["run", "build"], 180_000);
  if (build.code !== 0) {
    throw new Error(`next build failed with ${build.code ?? build.signal}`);
  }

  const port = await getPort();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    cwd,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });

  const url = `http://127.0.0.1:${port}/en/404`;
  await waitForServer(url, 30_000);
  const response = await fetch(url);
  await response.arrayBuffer();
  const cacheControl = response.headers.get("cache-control") ?? "";
  const publiclyCached = /(?:^|,)\s*s-maxage\s*=\s*[1-9]\d*/i.test(cacheControl);
  const protectedFromCaching = /(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|$)/i.test(cacheControl);

  console.log(JSON.stringify({ status: response.status, cacheControl }));
  process.exitCode = response.status === 404 && publiclyCached && !protectedFromCaching ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
