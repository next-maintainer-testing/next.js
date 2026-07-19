import { spawn } from "node:child_process";
import { once } from "node:events";

const output = [];
const record = (chunk) => {
  const text = chunk.toString();
  output.push(text);
  process.stdout.write(text);
};

async function run(command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  const [code, signal] = await once(child, "exit");
  return { code, signal };
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}

let server;
let result = 2;
try {
  const build = await run("npm", ["run", "build"], { cwd: process.cwd(), env: process.env });
  if (build.code !== 0) {
    console.error(`Verification failed: build exited with ${build.code ?? build.signal}`);
  } else {
    const port = String(32000 + Math.floor(Math.random() * 10000));
    server = spawn(process.execPath, ["server.js"], {
      cwd: new URL("./.next/standalone/", import.meta.url),
      env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: port },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", record);
    server.stderr.on("data", record);

    let response;
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null || server.signalCode !== null) break;
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        await response.text();
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (!response) {
      console.error(`Verification failed: standalone server did not respond: ${lastError ?? "server exited"}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const observed = output.join("");
      const symptom = /Cannot convert argument to a ByteString because the character at index \d+ has a value of \d+ which is greater than 255/.test(observed);
      console.log(`Standalone response status: ${response.status}; ByteString error observed: ${symptom}`);
      result = symptom ? 0 : 1;
    }
  }
} catch (error) {
  console.error("Verification failed:", error);
} finally {
  process.exitCode = result;
  if (server) await stop(server);
}
