import { spawn } from "node:child_process";
import net from "node:net";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await freePort();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

let response;
let failure;
try {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}`);
    }
    try {
      const candidate = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      const html = await candidate.text();
      if (!candidate.ok) {
        throw new Error(`HTTP ${candidate.status}: ${html.slice(0, 500)}`);
      }
      response = html;
      break;
    } catch (error) {
      failure = error;
      await sleep(500);
    }
  }

  if (!response) {
    throw new Error(`Timed out fetching the rendered page: ${failure?.message ?? "unknown error"}`);
  }

  const loadingRendered = /<div[^>]*id=["']loading["'][^>]*>LOADING!!!<\/div>/.test(response);
  const pageRendered = /<main[^>]*id=["']ssr-content["'][^>]*>SSR page content<\/main>/.test(response);
  const pageHidden = /<div\b(?=[^>]*\bhidden(?:\s|=|>))[^>]*>\s*<main[^>]*id=["']ssr-content["'][^>]*>SSR page content<\/main>\s*<\/div>/.test(response);

  if (!pageRendered) {
    throw new Error("The completed SSR page was missing from the server-rendered HTML");
  }

  if (loadingRendered && pageHidden) {
    process.exitCode = 0;
    console.log("SYMPTOM_PRESENT: loading.tsx is rendered while the completed SSR page is inside a hidden container.");
  } else {
    process.exitCode = 1;
    console.log(`SYMPTOM_ABSENT: loadingRendered=${loadingRendered}, pageHidden=${pageHidden}; the SSR page is not hidden behind loading.tsx.`);
  }
} catch (error) {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: ${error.stack ?? error}`);
  if (output) console.error(`Next.js output:\n${output.slice(-8000)}`);
} finally {
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
