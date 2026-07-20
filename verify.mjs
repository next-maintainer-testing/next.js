import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, output }));
  });
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForPage(url, attempts = 120) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Server did not become ready");
}

let server;
let serverOutput = "";

try {
  const build = await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (build.code !== 0) {
    console.error(build.output);
    process.exitCode = 2;
  } else {
    const port = await availablePort();
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    server.stdout.on("data", (chunk) => { serverOutput += chunk; });
    server.stderr.on("data", (chunk) => { serverOutput += chunk; });

    const baseUrl = `http://127.0.0.1:${port}`;
    const falseBranchHtml = await waitForPage(`${baseUrl}/?apple=x`);
    const trueBranchResponse = await fetch(`${baseUrl}/?apple=aa`);
    const trueBranchHtml = await trueBranchResponse.text();

    const falseBranch = falseBranchHtml.match(/<p id="result">([^<]+)<\/p>/)?.[1];
    const trueBranch = trueBranchHtml.match(/<p id="result">([^<]+)<\/p>/)?.[1];
    console.log(JSON.stringify({ falseBranch, trueBranch }));

    if (falseBranch === "POST" && trueBranch === "POST") {
      console.log("Symptom present: the false branch was incorrectly minified to POST.");
      process.exitCode = 0;
    } else if (falseBranch === "l" && trueBranch === "POST") {
      console.log("Symptom absent: conditional assignment and fallback behave correctly.");
      process.exitCode = 1;
    } else {
      console.error(`Unexpected runtime output. Server log:\n${serverOutput}`);
      process.exitCode = 2;
    }
  }
} catch (error) {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 2;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "close"),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await once(server, "close");
    }
  }
}
