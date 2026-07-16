import { rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

try {
  rmSync(join(root, ".next"), { recursive: true, force: true });

  const result = spawnSync(process.execPath, [nextBin, "typegen"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });

  if (result.error || result.status !== 0) {
    console.error("next typegen failed", result.error ?? result.stderr ?? result.stdout);
    process.exitCode = 2;
  } else {
    const routes = readFileSync(join(root, ".next", "types", "routes.d.ts"), "utf8");
    const malformedStaticRoute = routes.includes('"/c[id]"');
    const missingIdParameter = /"\/c\[id\]":\s*\{\}/.test(routes);

    if (malformedStaticRoute && missingIdParameter) {
      console.log('BUG PRESENT: /c:id was generated as static route "/c[id]" with no id parameter.');
      process.exitCode = 0;
    } else {
      console.log("BUG ABSENT: /c:id was not generated as a parameterless static route.");
      console.log(routes);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error("Verification failed", error);
  process.exitCode = 2;
}
