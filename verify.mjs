import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

await rm(".next", { recursive: true, force: true });
await rm("ui/dist", { recursive: true, force: true });

const child = spawn("npm", ["run", "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CI: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    FORCE_COLOR: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
const append = (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
};
child.stdout.on("data", append);
child.stderr.on("data", append);

let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
}, 280_000);

const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
}).catch((error) => ({ error }));

clearTimeout(timeout);

if (result.error) {
  console.error(`CHECK_FAILED: could not run npm build: ${result.error.message}`);
  process.exitCode = 2;
} else if (timedOut) {
  console.error("CHECK_FAILED: npm build timed out");
  process.exitCode = 2;
} else {
  const hasReportedTypeError = /TypeError:[^\r\n]*\.default\)?\s+is not a function/.test(output);
  const failedDuringPageData = /Failed to collect page data|Failed to collect configuration/.test(output);

  if (result.code !== 0 && hasReportedTypeError && failedDuringPageData) {
    console.log("SYMPTOM_PRESENT: compiled next/font local default import throws during page-data collection");
    process.exitCode = 0;
  } else if (result.code === 0) {
    console.log("SYMPTOM_ABSENT: next build completed successfully");
    process.exitCode = 1;
  } else {
    console.error(
      `CHECK_FAILED: build exited ${result.code ?? `via ${result.signal}`} without the reported next/font TypeError`,
    );
    process.exitCode = 2;
  }
}
