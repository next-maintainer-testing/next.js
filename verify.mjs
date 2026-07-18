import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const tsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const result = spawnSync(tsc, ["--project", "tsconfig.json", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 1024 * 1024,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (output) process.stdout.write(output);

const reportedDiagnostic =
  output.includes("Type 'Promise<void>' is not assignable to type 'VoidOrUndefinedOnly'") ||
  (output.includes("Promise<void>") && output.includes("TransitionFunction"));

if (result.error) {
  console.error(`TypeScript check failed to execute: ${result.error.message}`);
  process.exitCode = 2;
} else if (reportedDiagnostic) {
  console.log("SYMPTOM_PRESENT: startTransition rejects the async Server Function callback.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("SYMPTOM_ABSENT: TypeScript accepts the async startTransition callback.");
  process.exitCode = 1;
} else {
  console.error(`CHECK_FAILED: tsc exited ${result.status} without the reported diagnostic.`);
  process.exitCode = 2;
}
