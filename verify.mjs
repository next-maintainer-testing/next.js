import { spawn } from "node:child_process";
import net from "node:net";

const commandTimeoutMs = 240_000;
let server;
let outcome = 2;
let serverOutput = "";

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
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
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out running ${command} ${args.join(" ")}`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${code ?? signal}`));
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

async function fetchPage(url) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server?.exitCode !== null) {
      throw new Error(`Next.js server exited early (${server.exitCode})\n${serverOutput}`);
    }
    try {
      const response = await fetch(url, { headers: { accept: "text/html" } });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("Server did not become ready");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

try {
  const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
  await run(process.execPath, [nextBin, "build"], commandTimeoutMs);

  const port = await reservePort();
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
    process.stdout.write(chunk);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
    process.stderr.write(chunk);
  });

  const html = await fetchPage(`http://127.0.0.1:${port}/`);
  if (html.includes('data-trace="missing"')) {
    console.log("SYMPTOM_PRESENT: page server render did not inherit the layout trace");
    outcome = 0;
  } else if (html.includes('data-trace="layout-trace"')) {
    console.log("SYMPTOM_ABSENT: page server render inherited the layout trace");
    outcome = 1;
  } else {
    throw new Error(`Trace result marker missing from response: ${html.slice(0, 1000)}`);
  }
} catch (error) {
  console.error("CHECK_FAILED:", error);
  outcome = 2;
} finally {
  process.exitCode = outcome;
  await stopServer(server);
}
