import { spawnSync } from "node:child_process";

const maxBuffer = 20 * 1024 * 1024;
const options = {
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  maxBuffer,
};

const typecheck = spawnSync("npm", ["run", "typecheck"], options);
const typecheckOutput = `${typecheck.stdout ?? ""}\n${typecheck.stderr ?? ""}`;
if (typecheck.error || typecheck.status !== 0) {
  console.error("CHECK_FAILED: TypeScript did not resolve the configDir alias.");
  console.error(typecheckOutput);
  process.exitCode = 2;
} else {
  const build = spawnSync("npm", ["run", "build"], options);
  const buildOutput = `${build.stdout ?? ""}\n${build.stderr ?? ""}`;
  const aliasFailure =
    build.status !== 0 &&
    /Module not found[^]*Can't resolve ['\"]~\/lib\/message['\"]/i.test(buildOutput);

  if (aliasFailure) {
    console.log("SYMPTOM_PRESENT: tsc resolves ~/lib/message, but next build cannot resolve it.");
    console.log(buildOutput);
    process.exitCode = 0;
  } else if (!build.error && build.status === 0) {
    console.log("SYMPTOM_ABSENT: both tsc and next build resolve ~/lib/message.");
    process.exitCode = 1;
  } else {
    console.error("CHECK_FAILED: next build failed for an unexpected reason.");
    console.error(buildOutput);
    process.exitCode = 2;
  }
}
