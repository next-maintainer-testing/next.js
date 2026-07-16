import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync(".next", { recursive: true, force: true });

const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url).pathname;
const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: new URL(".", import.meta.url),
  encoding: "utf8",
  timeout: 240_000,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`);
  process.exitCode = 2;
} else if (
  result.status !== 0 &&
  /Module not found: Can't resolve ['"]\.\/Button\.js['"]/.test(output)
) {
  console.log("Observed issue #46678: dynamic import './Button.js' did not resolve Button.tsx.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("Issue #46678 absent: the fully specified dynamic import built successfully.");
  process.exitCode = 1;
} else {
  console.error(`Build failed without the reported symptom (status ${result.status}).`);
  process.exitCode = 2;
}
