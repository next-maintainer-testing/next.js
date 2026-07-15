import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const brokenUrl =
  "https://nextjs.org/docs/app/api-reference/functions/server-actions#with-client-components";
const port = 31000 + (process.pid % 1000);
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

let output = "";
let responseBody = "";
let responseStatus = null;
let result = 2;
let observation = "verification did not complete";

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const append = (chunk) => {
  output += chunk.toString();
  if (output.length > 1_000_000) output = output.slice(-1_000_000);
};
child.stdout.on("data", append);
child.stderr.on("data", append);

try {
  const deadline = Date.now() + 60_000;
  let childExited = false;
  child.once("exit", () => {
    childExited = true;
  });

  while (Date.now() < deadline) {
    if (output.includes(brokenUrl)) break;
    if (childExited) {
      observation = "next dev exited before serving the reproduction";
      result = 2;
      break;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = response.status;
      responseBody = await response.text();
      await delay(1_500);
      break;
    } catch {
      await delay(250);
    }
  }

  const evidence = `${output}\n${responseBody}`;
  if (evidence.includes(brokenUrl)) {
    result = 0;
    observation = `broken documentation URL emitted (HTTP ${responseStatus ?? "not completed"})`;
  } else if (responseStatus !== null) {
    result = 1;
    observation = `page compilation completed without the broken URL (HTTP ${responseStatus})`;
  } else {
    result = 2;
    observation = "timed out before page compilation completed";
  }
} catch (error) {
  result = 2;
  observation = `verification failed: ${error instanceof Error ? error.message : String(error)}`;
} finally {
  process.exitCode = result;
  console.log(JSON.stringify({ result, observation, responseStatus }));

  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
