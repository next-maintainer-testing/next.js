import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGKILL");
}, 240_000);

const result = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ error }));
  child.once("close", (code, signal) => resolve({ code, signal }));
});
clearTimeout(timer);

const normalized = output.replace(/\u001b\[[0-9;]*m/g, "");
const reportedSymptom =
  /Module not found:\s*Can't resolve ['"]\.\.\/components\/Foo\.js['"]/.test(
    normalized,
  );

if (reportedSymptom) {
  console.log("\nVERIFICATION: reproduced fully specified import resolution failure");
  process.exitCode = 0;
} else if (!timedOut && "code" in result && result.code === 0) {
  console.log("\nVERIFICATION: build succeeded; reported symptom is absent");
  process.exitCode = 1;
} else {
  console.error(
    `\nVERIFICATION: check failed without the reported symptom (${JSON.stringify(result)}, timedOut=${timedOut})`,
  );
  process.exitCode = 2;
}
