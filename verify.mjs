import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

function requestOg(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/og", timeout: 60000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        contentType: response.headers["content-type"] || "",
        bytes: Buffer.concat(chunks).length,
      }));
      response.on("aborted", () => resolve({ error: "response aborted before completion" }));
      response.on("error", (error) => resolve({ error: error.message }));
    });
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", (error) => resolve({ error: error.message }));
  });
}

const port = await freePort();
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
const child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12000);
  });
}

try {
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code=${child.exitCode}, signal=${child.signalCode})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      await response.arrayBuffer();
      ready = true;
      break;
    } catch {}
    await delay(250);
  }
  if (!ready) throw new Error("Timed out waiting for Next.js to become ready");

  const result = await requestOg(port);
  if (result.error) {
    process.exitCode = 0;
    console.log(`symptom present: GET /og failed without a complete response (${result.error})`);
  } else if (result.status >= 500 || result.bytes === 0) {
    process.exitCode = 0;
    console.log(`symptom present: GET /og returned status ${result.status}, content-type ${result.contentType || "<none>"}, ${result.bytes} bytes`);
  } else if (result.status === 200 && result.contentType.includes("image/png") && result.bytes > 0) {
    process.exitCode = 1;
    console.log(`symptom absent: GET /og returned status 200, content-type ${result.contentType}, ${result.bytes} bytes`);
  } else {
    throw new Error(`Unexpected response: status ${result.status}, content-type ${result.contentType || "<none>"}, ${result.bytes} bytes`);
  }
} catch (error) {
  process.exitCode = 2;
  console.error(`check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(output);
} finally {
  await stop(child);
}
