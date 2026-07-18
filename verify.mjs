import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = 32000 + Math.floor(Math.random() * 20000);
const baseUrl = `http://${host}:${port}`;
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  HOSTNAME: host,
};

function appendOutput(current, chunk) {
  const combined = current + chunk.toString();
  return combined.length > 30000 ? combined.slice(-30000) : combined;
}

async function run(command, args, timeoutMs) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = appendOutput(output, chunk);
  });
  child.stderr.on("data", (chunk) => {
    output = appendOutput(output, chunk);
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminate(child);
  }, timeoutMs);

  const result = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  return { ...result, output, timedOut };
}

function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  terminate(child);
  const forced = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
  }, 5000);
  await closed;
  clearTimeout(forced);
}

async function waitForServer(child, outputRef) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`next start exited before serving requests\n${outputRef()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status < 500) return await response.text();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`next start did not become ready\n${outputRef()}`);
}

let server;
let exitCode = 2;
let observation = "check did not complete";

try {
  const build = await run("npm", ["run", "build"], 210000);
  if (build.timedOut || build.code !== 0) {
    throw new Error(`next build failed (code=${build.code}, timeout=${build.timedOut})\n${build.output}`);
  }

  let serverOutput = "";
  server = spawn("npm", ["run", "start", "--", "--port", String(port)], {
    cwd: process.cwd(),
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    serverOutput = appendOutput(serverOutput, chunk);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput = appendOutput(serverOutput, chunk);
  });

  const homeHtml = await waitForServer(server, () => serverOutput);

  const before = await fetch(`${baseUrl}/params/01`);
  const beforeBody = await before.text();
  if (before.status !== 200 || !beforeBody.includes("Params : 01")) {
    throw new Error(
      `precondition failed: /params/01 before revalidation returned ${before.status}, expected 200 with Params : 01`
    );
  }

  const actionMatch = homeHtml.match(/name=["'](\$ACTION_ID_[^"']+)["']/);
  if (!actionMatch) {
    throw new Error("precondition failed: Revalidate server action was not present on /");
  }

  const form = new FormData();
  form.append(actionMatch[1], "");
  const actionResponse = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: { Origin: baseUrl },
    body: form,
    redirect: "manual",
  });
  if (actionResponse.status < 200 || actionResponse.status >= 400) {
    throw new Error(`Revalidate server action returned unexpected status ${actionResponse.status}`);
  }

  const after = await fetch(`${baseUrl}/params/01`);
  const afterBody = await after.text();
  if (after.status === 404) {
    exitCode = 0;
    observation =
      "symptom present: /params/01 was 200 with 'Params : 01' before revalidatePath('/', 'layout') and 404 afterward";
  } else if (after.status === 200 && afterBody.includes("Params : 01")) {
    exitCode = 1;
    observation =
      "symptom absent: /params/01 remained 200 with 'Params : 01' after revalidatePath('/', 'layout')";
  } else {
    throw new Error(
      `unexpected post-revalidation response: status ${after.status}, Params marker=${afterBody.includes("Params : 01")}`
    );
  }
} catch (error) {
  exitCode = 2;
  observation = `check failure: ${error instanceof Error ? error.stack || error.message : String(error)}`;
} finally {
  process.exitCode = exitCode;
  console.log(observation);
  if (server) await stop(server);
}
