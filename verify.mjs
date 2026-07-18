import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

await rm(".next", { recursive: true, force: true });

const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
}, 240_000);

const result = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ error }));
  child.once("close", (code, signal) => resolve({ code, signal }));
});
clearTimeout(timer);

const hasDiagnostic = output.includes("useSearchParams() should be wrapped in a suspense boundary");
const attributesAbout = /page [\"']\/about[\"']/.test(output);

if (!timedOut && "code" in result && result.code !== 0 && hasDiagnostic && attributesAbout) {
  console.log("\nVERIFIED: build fails with the missing-Suspense diagnostic attributed to /about.");
  process.exitCode = 0;
} else if (!timedOut && "code" in result && result.code === 0) {
  console.log("\nABSENT: build completed successfully.");
  process.exitCode = 1;
} else if (!timedOut && "code" in result && result.code !== 0 && !hasDiagnostic) {
  console.error("\nCHECK_FAILED: build failed for an unrelated reason.");
  process.exitCode = 2;
} else if (!timedOut && "code" in result && result.code !== 0) {
  console.log("\nABSENT: missing-Suspense diagnostic was not attributed to /about.");
  process.exitCode = 1;
} else {
  console.error(`\nCHECK_FAILED: ${timedOut ? "build timed out" : result.error ?? `build ended via ${result.signal}`}`);
  process.exitCode = 2;
}
