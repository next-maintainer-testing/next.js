import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync(".next", { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "--turbopack"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 240_000,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const hasReportedSymptom =
  result.status !== 0 &&
  output.includes("yak_swc.wasm") &&
  output.includes("Module not found: Can't resolve") &&
  output.includes("server relative imports are not implemented yet");

if (hasReportedSymptom) {
  console.log("REPRODUCED: Turbopack rejected the absolute yak_swc.wasm SWC plugin path.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("NOT REPRODUCED: next build --turbopack completed successfully.");
  process.exitCode = 1;
} else {
  console.error("CHECK FAILED: build failed without the reported absolute SWC plugin-path error.");
  console.error(output.slice(-8000));
  process.exitCode = 2;
}

rmSync(".next", { recursive: true, force: true });
