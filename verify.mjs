import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

rmSync(resolve(".next"), { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "build"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`);
  process.exitCode = 2;
} else if (
  result.status !== 0 &&
  output.includes(
    "Conflict: Multiple assets emit different content to the same filename middleware-manifest.json",
  )
) {
  console.log("Observed the reported middleware-manifest.json asset conflict.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("Build succeeded; the reported symptom is absent.");
  process.exitCode = 1;
} else {
  console.error(
    `Build failed without the reported asset conflict (exit ${result.status}).`,
  );
  process.exitCode = 2;
}
