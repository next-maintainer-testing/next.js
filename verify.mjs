import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const child = spawn(nextBin, ["build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}

const result = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ code: null, signal: null, error }));
  child.once("close", (code, signal) => resolve({ code, signal, error: null }));
});

const symptom = /Module not found: Can't resolve ['"]\.\/\.\.\.['"]/.test(output);
if (symptom) {
  console.log("VERIFICATION: reproduced webpack resolution of bg-[url(...)] from bug.txt");
  process.exitCode = 0;
} else if (result.code === 0) {
  console.log("VERIFICATION: build succeeded; reported symptom is absent");
  process.exitCode = 1;
} else {
  console.error(
    `VERIFICATION: check failed before observing the reported symptom (code=${result.code}, signal=${result.signal}, error=${result.error?.message ?? "none"})`,
  );
  process.exitCode = 2;
}

try {
  await rm(path.join(process.cwd(), ".next"), { recursive: true, force: true });
} catch (error) {
  console.error(`VERIFICATION: cleanup failed: ${error.message}`);
  process.exitCode = 2;
}
