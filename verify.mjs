import { spawn } from "node:child_process";
import net from "node:net";

const cwd = new URL(".", import.meta.url).pathname;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" };
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
let productionServer = null;
let resultCode = 2;

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      env,
      stdio: "inherit",
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`next ${args.join(" ")} exited with code ${code} signal ${signal ?? "none"}`));
    });
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });
  child.output = () => output;
  return child;
}

async function fetchWhenReady(url) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    if (productionServer.exitCode !== null) {
      throw new Error(`next start exited early with ${productionServer.exitCode}: ${productionServer.output()}`);
    }
    try {
      return await fetch(url, { redirect: "manual", cache: "no-store" });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`server did not become ready: ${lastError?.message ?? "unknown error"}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

try {
  await run(["build", "--experimental-build-mode=compile"], 150_000);
  await run(["build", "--experimental-build-mode=generate-env"], 90_000);

  const port = await reservePort();
  productionServer = startServer(port);
  const response = await fetchWhenReady(`http://127.0.0.1:${port}/not-generated-at-build-time`);
  const cacheControl = response.headers.get("cache-control") ?? "";
  await response.arrayBuffer();
  console.log(`OBSERVED_STATUS=${response.status}`);
  console.log(`OBSERVED_CACHE_CONTROL=${cacheControl}`);

  const directives = new Set(cacheControl.toLowerCase().split(",").map((part) => part.trim()));
  const reportedPrivateHeader = [
    "private",
    "no-cache",
    "no-store",
    "max-age=0",
    "must-revalidate",
  ].every((directive) => directives.has(directive));
  const expectedIsrHeader = [...directives].some((directive) => directive.startsWith("s-maxage="));

  if (response.status !== 200) {
    throw new Error(`route returned unexpected status ${response.status}`);
  }
  if (reportedPrivateHeader) {
    console.log("SYMPTOM_PRESENT: compile + generate-env returned the reported private/no-cache header");
    resultCode = 0;
  } else if (expectedIsrHeader) {
    console.log("SYMPTOM_ABSENT: route returned an ISR s-maxage header");
    resultCode = 1;
  } else {
    throw new Error(`unrecognized cache-control behavior: ${cacheControl || "<missing>"}`);
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack ?? error}`);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (productionServer) await stopServer(productionServer);
}
