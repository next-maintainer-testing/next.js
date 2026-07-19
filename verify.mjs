import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync(".next", { recursive: true, force: true });

const result = spawnSync("npm", ["run", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  encoding: "utf8",
  timeout: 180_000,
  maxBuffer: 20 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(output);

const symptom = /[`']?cookies[`']? was called outside a request scope/i.test(output);

if (symptom) {
  console.log("VERIFICATION: reported cookies request-scope build error observed");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("VERIFICATION: build completed without the reported error");
  process.exitCode = 1;
} else {
  console.error(
    `VERIFICATION: build check failed without the reported symptom (status=${result.status}, signal=${result.signal}, error=${result.error?.message ?? "none"})`,
  );
  process.exitCode = 2;
}
