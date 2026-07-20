import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const cwd = process.cwd();
const outDir = join(cwd, "out");
const nextBin = join(cwd, "node_modules", "next", "dist", "bin", "next");
let browser;
let server;
let finalExitCode = 2;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".ico")) return "image/x-icon";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function resolveStaticFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = normalize(decoded).replace(/^[/\\]+/, "");
  const base = resolve(outDir);
  const candidates = decoded === "/"
    ? [join(base, "index.html")]
    : [join(base, relative), join(base, `${relative}.html`), join(base, relative, "index.html")];
  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    if (absolute !== base && !absolute.startsWith(`${base}${sep}`)) continue;
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return null;
}

async function listen() {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const file = resolveStaticFile(url.pathname);
    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentType(file),
      "cache-control": "no-store",
    });
    response.end(readFileSync(file));
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  return server.address().port;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

try {
  rmSync(join(cwd, ".next"), { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
  if (!existsSync(nextBin)) throw new Error("Next.js is not installed");
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (build.stdout) process.stdout.write(build.stdout);
  if (build.stderr) process.stderr.write(build.stderr);
  if (build.error || build.status !== 0) {
    throw new Error(`next build failed with ${build.error?.message ?? `exit ${build.status}`}`);
  }

  const port = await listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
  const page = await browser.newPage();
  const responseChecks = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/page1" && url.searchParams.has("_rsc")) {
      responseChecks.push((async () => {
        let body = "";
        try { body = await response.text(); } catch {}
        return {
          url: response.url(),
          status: response.status(),
          contentType: response.headers()["content-type"] ?? "",
          startsWithHtml: /^\s*(?:<!doctype html>|<html)/i.test(body),
        };
      })());
    }
  });

  await page.goto(`${origin}/`, { waitUntil: "networkidle0", timeout: 30_000 });
  const linkExists = await page.$('a[href="/page1"]') !== null;
  const homeBeforeClick = await page.$eval("body", (element) => element.innerText);
  if (!linkExists || !homeBeforeClick.includes("Home page content")) {
    throw new Error("The reproduction page or its Link did not render");
  }

  await delay(2_000);
  const prefetchResponses = await Promise.all(responseChecks);
  const malformedPrefetch = prefetchResponses.find((entry) =>
    entry.status === 200 && entry.contentType.toLowerCase().includes("text/html") && entry.startsWithHtml
  );

  await page.click('a[href="/page1"]');
  await delay(3_000);
  const finalUrl = new URL(page.url());
  const finalBody = await page.$eval("body", (element) => element.innerText);
  const linkDidNothing = finalUrl.pathname === "/" && finalBody.includes("Home page content") && !finalBody.includes("Page 1 content");
  const navigationWorked = finalUrl.pathname === "/page1" && finalBody.includes("Page 1 content");

  console.log(JSON.stringify({
    malformedPrefetch: malformedPrefetch ?? null,
    prefetchResponses,
    finalPathname: finalUrl.pathname,
    linkDidNothing,
    navigationWorked,
  }, null, 2));

  if (malformedPrefetch && linkDidNothing) {
    console.log("SYMPTOM_PRESENT: prefetch received HTML and the Link click did not navigate");
    finalExitCode = 0;
  } else if (navigationWorked) {
    console.log("SYMPTOM_ABSENT: the Link click navigated to page1");
    finalExitCode = 1;
  } else {
    throw new Error("Browser ran, but neither the reported symptom nor expected navigation was observed");
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack ?? error}`);
  finalExitCode = 2;
} finally {
  process.exitCode = finalExitCode;
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
}
