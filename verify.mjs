import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputDir = join(root, ".vercel", "output");
const requestPath = "/progress";
const requestHeaders = {
  rsc: "1",
  "next-router-prefetch": "1",
  "next-url": "/payment",
};

function fail(message) {
  console.error(`CHECK_FAILED: ${message}`);
  process.exitCode = 2;
}

function substitute(template, match) {
  return template.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? "");
}

function conditionsMatch(route) {
  for (const condition of route.has ?? []) {
    if (condition.type !== "header") return false;
    const actual = requestHeaders[condition.key.toLowerCase()];
    if (actual === undefined) return false;
    if (condition.value !== undefined && !new RegExp(`^(?:${condition.value})$`, "i").test(actual)) {
      return false;
    }
  }
  for (const condition of route.missing ?? []) {
    if (condition.type === "header" && requestHeaders[condition.key.toLowerCase()] !== undefined) {
      return false;
    }
  }
  return true;
}

try {
  const manifest = JSON.parse(readFileSync(join(root, "repro.json"), "utf8"));
  const expectedManifest = {
    issue: { number: 74895, repository: "vercel/next.js" },
    versions: { next: "15.1.4", react: "19.0.0" },
    verify: { command: "node verify.mjs", deterministic: false, timeoutSeconds: 300 },
  };
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error("repro.json does not match the persisted issue/version/check contract");
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(join(root, ".vercel"), { recursive: true });
  writeFileSync(
    join(root, ".vercel", "project.json"),
    JSON.stringify({
      orgId: "team_local",
      projectId: "prj_local",
      projectName: "next-74895-vercel-repro",
      settings: {
        framework: "nextjs",
        buildCommand: null,
        devCommand: null,
        installCommand: "",
        outputDirectory: null,
        rootDirectory: null,
        directoryListing: false,
        nodeVersion: "24.x",
      },
    })
  );

  execFileSync(
    "npx",
    ["--yes", "vercel@56.3.2", "build", "--yes", "--token=fake"],
    {
      cwd: root,
      env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
      timeout: 240_000,
    }
  );

  const config = JSON.parse(readFileSync(join(outputDir, "config.json"), "utf8"));
  let selectedDestination = requestPath;
  let interceptionDestination = null;
  let genericRscOverride = null;

  // Vercel evaluates override routes against the incoming URL. The later RSC
  // override can therefore replace an earlier interception destination.
  for (const route of config.routes ?? []) {
    if (route.handle === "filesystem") break;
    if (!route.src || !conditionsMatch(route)) continue;
    const match = new RegExp(route.src, "i").exec(requestPath);
    if (!match || !route.dest) continue;
    const destination = substitute(route.dest, match);
    if (destination.includes("(..)progress")) interceptionDestination = destination;
    if (route.override) selectedDestination = destination;
    if (route.override && destination.endsWith("progress.rsc")) {
      genericRscOverride = route;
    }
    if (!route.continue) break;
  }

  if (!interceptionDestination) {
    throw new Error("the Vercel build emitted no Payment-to-Progress interception route");
  }
  if (!genericRscOverride) {
    throw new Error("the Vercel build emitted no matching production RSC override");
  }

  const normalRsc = join(outputDir, "functions", "progress.rsc.prerender-fallback.rsc");
  const modalRsc = join(outputDir, "functions", "payment", "(..)progress.rsc.prerender-fallback.rsc");
  if (!existsSync(normalRsc) || !existsSync(modalRsc)) {
    throw new Error("expected normal and intercepted prerendered RSC responses were not emitted");
  }

  const normalBody = readFileSync(normalRsc, "utf8");
  const modalBody = readFileSync(modalRsc, "utf8");
  const selectedBody = selectedDestination === "/progress.rsc"
    ? normalBody
    : selectedDestination.includes("(..)progress.rsc")
      ? modalBody
      : "";

  if (!normalBody.includes("NORMAL_PROGRESS_PAGE") || !modalBody.includes("PAYMENT_MODAL_PROGRESS")) {
    throw new Error("the built RSC responses do not contain both observable page markers");
  }

  const nextVersion = JSON.parse(readFileSync(join(root, "node_modules", "next", "package.json"), "utf8")).version;
  console.log(JSON.stringify({
    nextVersion,
    request: { path: requestPath, headers: requestHeaders },
    interceptionDestination,
    selectedDestination,
    observed: selectedBody.includes("NORMAL_PROGRESS_PAGE")
      ? "NORMAL_PROGRESS_PAGE"
      : selectedBody.includes("PAYMENT_MODAL_PROGRESS")
        ? "PAYMENT_MODAL_PROGRESS"
        : "UNKNOWN",
  }, null, 2));

  process.exitCode = selectedBody.includes("NORMAL_PROGRESS_PAGE") ? 0 : 1;
} catch (error) {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
}
