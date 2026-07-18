import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const root = new URL(".", import.meta.url).pathname;
let serverProcess = null;
let deployment = null;

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout = (stdout + chunk).slice(-80_000)));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-80_000)));
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 240_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ code, signal, stdout, stderr });
    });
  });
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("response is not a WebP image");
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X" && data + 10 <= buffer.length) {
      return { width: 1 + buffer.readUIntLE(data + 4, 3), height: 1 + buffer.readUIntLE(data + 7, 3) };
    }
    if (type === "VP8L" && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
    if (type === "VP8 " && data + 10 <= buffer.length) {
      for (let i = data; i + 9 < Math.min(data + size, buffer.length); i++) {
        if (buffer[i + 3] === 0x9d && buffer[i + 4] === 0x01 && buffer[i + 5] === 0x2a) {
          return { width: buffer.readUInt16LE(i + 6) & 0x3fff, height: buffer.readUInt16LE(i + 8) & 0x3fff };
        }
      }
    }
    offset = data + size + (size % 2);
  }
  throw new Error("could not read WebP dimensions");
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const exited = new Promise((resolveExit) => serverProcess.once("exit", resolveExit));
  serverProcess.kill("SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 3_000)),
  ]);
  if (!graceful && serverProcess.exitCode === null) {
    serverProcess.kill("SIGKILL");
    await exited;
  }
}

async function main() {
  const nextPackage = JSON.parse(await readFile(join(root, "node_modules", "next", "package.json"), "utf8"));
  const reactPackage = JSON.parse(await readFile(join(root, "node_modules", "react", "package.json"), "utf8"));
  const major = Number.parseInt(nextPackage.version, 10);
  console.log(`Testing Next.js ${nextPackage.version} with React ${reactPackage.version}`);

  await rm(join(root, ".next"), { recursive: true, force: true });
  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  const buildArgs = [nextBin, "build"];
  if (major >= 16) buildArgs.push("--webpack");
  const build = await run(process.execPath, buildArgs, { cwd: root, timeoutMs: 240_000 });
  if (build.code !== 0) {
    throw new Error(`production build failed (${build.code ?? build.signal})\n${build.stdout}\n${build.stderr}`);
  }

  deployment = await mkdtemp(join(tmpdir(), "issue-67623-standalone-"));
  await cp(join(root, ".next", "standalone"), deployment, { recursive: true });
  await cp(join(root, "public"), join(deployment, "public"), { recursive: true });
  await cp(join(root, ".next", "static"), join(deployment, ".next", "static"), { recursive: true });

  const sharpPackage = join(deployment, "node_modules", "sharp", "package.json");
  await access(sharpPackage);
  await rm(join(deployment, "node_modules", "@img"), { recursive: true, force: true });
  console.log("Standalone deployment keeps sharp installed but omits its traced native optional packages");

  const port = await availablePort();
  serverProcess = spawn(process.execPath, [join(deployment, "server.js")], {
    cwd: deployment,
    env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  serverProcess.stdout.on("data", (chunk) => (serverLog += chunk));
  serverProcess.stderr.on("data", (chunk) => (serverLog += chunk));

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverProcess.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (!ready) throw new Error(`standalone production server did not become ready\n${serverLog}`);

  const response = await fetch(
    `http://127.0.0.1:${port}/_next/image?url=%2Fsource.webp&w=128&q=75`,
    { headers: { accept: "image/webp" } },
  );
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`optimizer returned HTTP ${response.status}: ${body.toString("utf8").slice(0, 500)}\n${serverLog}`);
  if (!contentType.startsWith("image/webp")) throw new Error(`optimizer returned unexpected content type ${contentType}`);
  const dimensions = webpDimensions(body);
  console.log(`Production optimizer returned ${dimensions.width}x${dimensions.height} (${body.length} bytes)`);

  if (dimensions.width === 800 && dimensions.height === 800) {
    console.log("SYMPTOM PRESENT: production fell back to the original 800x800 image instead of resizing it to width 128");
    return 0;
  }
  if (dimensions.width === 128 && dimensions.height === 128) {
    console.log("SYMPTOM ABSENT: production resized the image to 128x128 even though the native sharp package was unavailable");
    return 1;
  }
  throw new Error(`unexpected optimizer dimensions ${dimensions.width}x${dimensions.height}`);
}

let result = 2;
try {
  result = await main();
} catch (error) {
  console.error(error?.stack || error);
}
process.exitCode = result;
await stopServer();
if (deployment) await rm(deployment, { recursive: true, force: true });
await rm(join(root, ".next"), { recursive: true, force: true });
