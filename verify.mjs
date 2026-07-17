import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".next", { recursive: true, force: true });

const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--turbopack"], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CI: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
const collect = (chunk) => {
  output = (output + chunk.toString()).slice(-30000);
  process.stdout.write(chunk);
};
build.stdout.on("data", collect);
build.stderr.on("data", collect);

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  const reachedCompilation = /Creating an optimized production build|Compiling \/|Turbopack/i.test(output);
  process.exitCode = reachedCompilation ? 0 : 2;
  console.error(reachedCompilation
    ? "\nSYMPTOM_PRESENT: Turbopack did not finish the DuckDB WASM build within 60 seconds."
    : "\nCHECK_FAILED: build timed out before compilation was observed.");
  try {
    process.kill(-build.pid, "SIGTERM");
  } catch {}
}, 60_000);

const result = await new Promise((resolve) => {
  build.once("error", (error) => resolve({ error }));
  build.once("exit", (code, signal) => resolve({ code, signal }));
});
clearTimeout(timer);

if (timedOut) {
  if (result.signal !== "SIGTERM") {
    try {
      process.kill(-build.pid, "SIGKILL");
    } catch {}
  }
} else if (result.error) {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: could not start Next.js build: ${result.error.message}`);
} else if (result.code === 0) {
  process.exitCode = 1;
  console.log("SYMPTOM_ABSENT: Turbopack completed the DuckDB WASM build.");
} else if (/build worker exited[^\n]*SIGKILL/i.test(output)) {
  process.exitCode = 0;
  console.error("SYMPTOM_PRESENT: Turbopack exhausted the build worker while compiling the DuckDB WASM import.");
} else {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: Next.js build exited with code ${result.code}, signal ${result.signal ?? "none"}.`);
}