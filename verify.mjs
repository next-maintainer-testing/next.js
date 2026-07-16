import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const markerPath = path.join(root, "app", "marker.js");
let server;

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("next build timed out"));
    }, 120_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`next build failed (code=${code}, signal=${signal})`));
    });
  });
}

async function cleanBuild(marker) {
  await writeFile(markerPath, `export const marker = ${JSON.stringify(marker)};\n`);
  await rm(path.join(root, ".next"), { recursive: true, force: true });
  await rm(path.join(root, "out"), { recursive: true, force: true });
  await runBuild();
}

function chunkReferences(html) {
  const matches = html.matchAll(/\/?_next\/static\/chunks\/[A-Za-z0-9_./-]+\.js/g);
  return [...new Set([...matches].map(({ 0: value }) =>
    value.startsWith("/") ? value : `/${value}`
  ))];
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

try {
  await cleanBuild("A");
  const oldHtml = await readFile(path.join(root, "out", "index.html"), "utf8");
  const oldChunks = chunkReferences(oldHtml);
  if (oldChunks.length === 0) throw new Error("no JavaScript chunk references found in exported HTML");

  await cleanBuild("B");

  server = createServer(async (request, response) => {
    try {
      if (request.url === "/" || request.url === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(oldHtml);
        return;
      }
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      const file = path.join(root, "out", pathname.replace(/^\/+/, ""));
      if (!file.startsWith(path.join(root, "out") + path.sep) || !(await exists(file))) {
        response.writeHead(404);
        response.end("Not Found");
        return;
      }
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(await readFile(file));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const pageResponse = await fetch(`${base}/`);
  const servedHtml = await pageResponse.text();
  const blankBeforeHydration = pageResponse.status === 200 && !servedHtml.includes("Loaded deployment");

  const statuses = [];
  for (const chunk of oldChunks) {
    const response = await fetch(`${base}${chunk}`);
    statuses.push({ chunk, status: response.status });
    await response.arrayBuffer();
  }
  const missing = statuses.filter(({ status }) => status === 404);

  console.log(JSON.stringify({
    blankBeforeHydration,
    referencedChunks: oldChunks.length,
    missingChunks: missing,
  }));
  process.exitCode = blankBeforeHydration && missing.length > 0 ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  await writeFile(markerPath, 'export const marker = "A";\n');
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
}
