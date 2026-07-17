import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "build-storybook", "--", "--quiet"], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 240_000,
  maxBuffer: 20 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);

const symptomPresent =
  output.includes("SB_FRAMEWORK_NEXTJS_0003") &&
  output.includes("Incompatible PostCSS configuration format detected") &&
  output.includes("Invalid PostCSS Plugin found at: plugins[0]");

if (symptomPresent) {
  console.log("\nVERIFICATION: Storybook rejected Next.js array-based PostCSS plugins.");
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log("\nVERIFICATION: Storybook build succeeded; symptom absent.");
  process.exitCode = 1;
} else {
  console.error(`\nVERIFICATION: Check failed without the reported symptom (status=${result.status}, signal=${result.signal}).`);
  process.exitCode = 2;
}
