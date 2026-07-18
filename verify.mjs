import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false"], {
  cwd: new URL(".", import.meta.url),
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(output);

if (result.error) {
  console.error(`TypeScript check failed to execute: ${result.error.message}`);
  process.exitCode = 2;
} else if (result.status === 0) {
  console.log("Reported exactOptionalPropertyTypes Link onClick diagnostic is absent.");
  process.exitCode = 1;
} else {
  const symptomPresent =
    output.includes("error TS2375") &&
    output.includes("onClick") &&
    output.includes("MouseEventHandler<HTMLAnchorElement> | undefined") &&
    output.includes("exactOptionalPropertyTypes: true");

  if (symptomPresent) {
    console.log("Reported exactOptionalPropertyTypes Link onClick diagnostic is present.");
    process.exitCode = 0;
  } else {
    console.error(`TypeScript exited with unexpected diagnostics (status ${result.status}).`);
    process.exitCode = 2;
  }
}
