import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const port = 32000 + (process.pid % 20000);
const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
let output = "";
let child;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const closed = new Promise((resolve) => child.once("close", resolve));
  await Promise.race([closed, delay(10000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([closed, delay(5000)]);
  }
}

try {
  child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) break;
    if (await canConnect()) {
      ready = true;
      break;
    }
    await delay(250);
  }

  if (!ready) {
    console.error("CHECK_FAILED: next dev did not accept connections\n" + output);
    process.exitCode = 2;
  } else {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(120000),
      headers: { accept: "text/html" },
    });
    const body = await response.text();
    await delay(500);

    const evidence = output + body;
    const relevantFailure =
      /Element type is invalid:[\s\S]*got: undefined/i.test(evidence) ||
      /Cannot access[^\n]* on the server[\s\S]*cannot dot into a client module/i.test(evidence);
    const rendered =
      response.status === 200 && body.includes("Comp1") && body.includes("Comp2");

    if (response.status >= 500 && relevantFailure) {
      console.log(`SYMPTOM_PRESENT: namespace client component failed with HTTP ${response.status}`);
      console.log(output);
      process.exitCode = 0;
    } else if (rendered) {
      console.log("SYMPTOM_ABSENT: namespace client components rendered successfully");
      process.exitCode = 1;
    } else {
      console.error(`CHECK_FAILED: unexpected HTTP ${response.status}\n${output}\n${body.slice(0, 2000)}`);
      process.exitCode = 2;
    }
  }
} catch (error) {
  console.error("CHECK_FAILED:", error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
