import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

const BUILD_TIMEOUT_MS = 240_000;
const START_TIMEOUT_MS = 30_000;
const PORT = 3199;

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function collect(child) {
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });
  return () => stripAnsi(output);
}

async function runBuild() {
  await rm(".next", { recursive: true, force: true });
  return await new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const getOutput = collect(child);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, BUILD_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, output: getOutput() });
    });
  });
}

async function runServerRequest() {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const getOutput = collect(child);
  let childError;
  child.once("error", (error) => {
    childError = error;
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  let response;
  try {
    while (Date.now() < deadline) {
      if (childError) throw childError;
      try {
        response = await fetch(`http://127.0.0.1:${PORT}/`);
        if (response.ok) {
          await response.text();
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!response?.ok) throw new Error("next start did not serve the root page in time");
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once("close", resolve);
    });
  }
  return getOutput();
}

function cacheRecords(output) {
  const marker = "Cache SET context for key:";
  return output
    .split(marker)
    .slice(1)
    .map((record) => record.split("\n").slice(0, 18).join("\n"));
}

try {
  const build = await runBuild();
  if (build.timedOut) throw new Error("next build timed out");
  if (build.code !== 0) throw new Error(`next build exited with ${build.code ?? build.signal}`);

  const serverOutput = await runServerRequest();
  const records = cacheRecords(serverOutput);
  const taggedFetchRecord = records.find(
    (record) =>
      /fetchCache:\s*true/.test(record) &&
      /tags:\s*\[[^\]]*['\"]my-data-tag['\"][^\]]*['\"]home-page['\"][^\]]*\]/s.test(record),
  );
  const appPageRecord = records.find((record) => /^\s*\/index\s+\{/.test(record));

  if (!taggedFetchRecord) {
    console.error("CHECK_FAILED: tagged fetch cache set was not observed while serving the root page");
    process.exitCode = 2;
  } else if (!appPageRecord) {
    console.error("CHECK_FAILED: /index full-page cache set was not observed");
    process.exitCode = 2;
  } else {
    const hasExpectedTags = /tags:\s*\[[^\]]*['\"]my-data-tag['\"][^\]]*['\"]home-page['\"][^\]]*\]/s.test(
      appPageRecord,
    );
    if (hasExpectedTags) {
      console.log("SYMPTOM_ABSENT: /index full-page cache context includes both fetch tags");
      process.exitCode = 1;
    } else {
      console.log("SYMPTOM_PRESENT: /index full-page cache context is missing the fetch tags");
      console.log(appPageRecord);
      process.exitCode = 0;
    }
  }
} catch (error) {
  console.error("CHECK_FAILED:", error);
  process.exitCode = 2;
}
