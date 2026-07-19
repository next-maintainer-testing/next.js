import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

await rm(".next", { recursive: true, force: true });

const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
}).catch((error) => ({ error }));

if (result.error) {
  console.error(`CHECK_FAILED: could not run next build: ${result.error.message}`);
  process.exitCode = 2;
} else {
  const metadataClientError =
    /export\s+["']?metadata["']?\s+from a component marked with\s+["']use client["']/i.test(output) ||
    (/metadata/i.test(output) && /use client/i.test(output) && /disallowed|not allowed|cannot|can't/i.test(output));

  if (result.code !== 0 && metadataClientError) {
    console.log("SYMPTOM_PRESENT: next build rejects metadata exported by the client root layout.");
    process.exitCode = 0;
  } else if (result.code === 0) {
    console.log("SYMPTOM_ABSENT: next build accepted metadata exported by the client root layout.");
    process.exitCode = 1;
  } else {
    console.error(`CHECK_FAILED: next build failed for an unrelated reason (code=${result.code}, signal=${result.signal ?? "none"}).`);
    process.exitCode = 2;
  }
}
