import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const symptom = 'If request is made from ReadableStream, mode should be "same-origin" or "cors"';

try {
  rmSync(".next", { recursive: true, force: true });
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 240_000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  process.stdout.write(output);

  if (result.error) {
    console.error(`Verification command failed: ${result.error.message}`);
    process.exitCode = 2;
  } else if (output.includes(symptom)) {
    console.log("Observed issue #83001 symptom.");
    process.exitCode = 0;
  } else if (result.status === 0) {
    console.log("Build succeeded without the reported symptom.");
    process.exitCode = 1;
  } else {
    console.error(`Build failed without the reported symptom (exit ${result.status}).`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
