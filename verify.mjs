import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";

const errorMessage =
  "Component selectors can only be used in conjunction with @emotion/babel-plugin, the swc Emotion plugin, or another Emotion-aware compiler transform";
const untransformedSelector = "NO_COMPONENT_SELECTOR";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function installedNextMajor() {
  const pkg = JSON.parse(await readFile(new URL("./node_modules/next/package.json", import.meta.url), "utf8"));
  return Number.parseInt(pkg.version, 10);
}

const port = await freePort();
const major = await installedNextMajor();
const args = ["dev"];
if (major >= 16) args.push("--webpack");
args.push("-H", "127.0.0.1", "-p", String(port));

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

const deadline = Date.now() + 120_000;
let responseText = "";
let responseStatus = 0;
let requestSucceeded = false;
let checkFailure = null;

try {
  while (Date.now() < deadline) {
    if (output.includes(errorMessage)) break;
    if (child.exitCode !== null) {
      checkFailure = `Next.js dev server exited early with code ${child.exitCode}.`;
      break;
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      responseStatus = response.status;
      responseText = await response.text();
      requestSucceeded = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const combined = `${output}\n${responseText}`;
  if (combined.includes(errorMessage)) {
    console.log(`Observed reported Emotion component-selector error (HTTP ${responseStatus || "request pending"}).`);
    process.exitCode = 0;
  } else if (requestSucceeded && responseText.includes(untransformedSelector)) {
    console.log(`Observed untransformed Emotion component selector in rendered CSS (HTTP ${responseStatus}); the nested green selector is ineffective and client rendering raises the reported error.`);
    process.exitCode = 0;
  } else if (requestSucceeded && responseStatus >= 200 && responseStatus < 500 && responseText.includes("A inside B")) {
    console.log(`The page rendered with a transformed component selector and without the reported error (HTTP ${responseStatus}).`);
    process.exitCode = 1;
  } else {
    console.error(checkFailure ?? `Unable to classify response (HTTP ${responseStatus || "none"}).\n${combined.slice(-4000)}`);
    process.exitCode = 2;
  }
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
