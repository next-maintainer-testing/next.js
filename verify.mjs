import { spawn } from "node:child_process";

const nextBin = new URL("./node_modules/next/dist/bin/next", import.meta.url);
let output = "";

try {
  const child = spawn(process.execPath, [nextBin.pathname, "build"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

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
  });

  const exportPathMismatch =
    /provided export path ['"]\/['"] doesn't match the ['"]\/\[lang\]\/page/i.test(output) &&
    /(?:prerendering page ['"]\/(?:en|es)['"]|export encountered errors)/i.test(output);

  if (result.code !== 0 && exportPathMismatch) {
    console.log("\nVERIFICATION: reproduced i18n generateStaticParams export-path mismatch");
    process.exitCode = 0;
  } else if (result.code === 0) {
    console.log("\nVERIFICATION: build succeeded; reported symptom is absent");
    process.exitCode = 1;
  } else {
    console.error(
      `\nVERIFICATION: build failed without the reported export-path mismatch (code=${result.code}, signal=${result.signal ?? "none"})`,
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error("VERIFICATION: check failed", error);
  process.exitCode = 2;
}
