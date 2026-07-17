import { spawn } from "node:child_process";

const child = spawn("npm", ["run", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
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

const timeout = setTimeout(() => child.kill("SIGTERM"), 280_000);
const result = await new Promise((resolveResult) => {
  child.once("error", (error) => resolveResult({ error }));
  child.once("close", (code, signal) => resolveResult({ code, signal }));
});
clearTimeout(timeout);

if (result.error) {
  console.error(`CHECK_FAILURE: could not start build: ${result.error.message}`);
  process.exitCode = 2;
} else {
  const hasSerializationError = output.includes(
    "Functions cannot be passed directly to Client Components",
  );
  const identifiesLinkComponent = output.includes("linkComponent: function");
  const identifiesNotFoundPrerender =
    output.includes('prerendering page "/_not-found"') ||
    output.includes("/_not-found/page");

  if (
    result.code !== 0 &&
    hasSerializationError &&
    identifiesLinkComponent &&
    identifiesNotFoundPrerender
  ) {
    console.log("SYMPTOM_PRESENT: _not-found prerender rejected linkComponent={Link}");
    process.exitCode = 0;
  } else if (result.code === 0) {
    console.log("SYMPTOM_ABSENT: next build completed successfully");
    process.exitCode = 1;
  } else {
    console.error(
      `CHECK_FAILURE: build failed without the reported complete signature (code=${result.code}, signal=${result.signal ?? "none"})`,
    );
    process.exitCode = 2;
  }
}
