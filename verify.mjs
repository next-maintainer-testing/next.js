import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

await rm(".next", { recursive: true, force: true });

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--turbo"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});

const symptom = /ReferenceError: Cannot access ['\"]ZodEnum['\"] before initialization/.test(output);
if (symptom && result.code !== 0) {
  process.exitCode = 0;
} else if (result.code === 0) {
  process.exitCode = 1;
} else {
  console.error(`Verification failed without the reported ZodEnum initialization error (code=${result.code}, signal=${result.signal}).`);
  process.exitCode = 2;
}
