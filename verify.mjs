import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync(".next", { recursive: true, force: true });

const nextBin = process.platform === "win32"
  ? "node_modules/.bin/next.cmd"
  : "node_modules/.bin/next";
const result = spawnSync(nextBin, ["build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  encoding: "utf8",
  timeout: 240_000,
  maxBuffer: 20 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Verification command failed: ${result.error.stack ?? result.error}`);
  process.exitCode = 2;
} else if (
  result.status !== 0 &&
  /Module not found:\s*Can't resolve ['"]simple-package['"]/.test(output)
) {
  console.log("SYMPTOM_PRESENT: Next.js could not resolve the installed simple-package artifact.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("SYMPTOM_ABSENT: Next.js built the app and resolved simple-package.");
  process.exitCode = 1;
} else {
  console.error(`CHECK_FAILED: next build exited ${result.status} without the reported module-resolution error.`);
  process.exitCode = 2;
}
