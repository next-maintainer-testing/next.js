import { spawn } from "node:child_process"

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""
child.stdout.on("data", (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on("data", (chunk) => {
  output += chunk
  process.stderr.write(chunk)
})

const result = await new Promise((resolve, reject) => {
  child.once("error", reject)
  child.once("close", (code, signal) => resolve({ code, signal }))
})

const decoratorDiagnostic =
  /Add @babel\/plugin-proposal-decorators/.test(output) &&
  /If you want to leave it as-is, add @babel\/plugin-syntax-decorators/.test(output)

if (decoratorDiagnostic) {
  console.log("OBSERVED: React Compiler build emitted Babel's missing decorators diagnostic")
  process.exitCode = 0
} else if (result.code === 0) {
  console.log("ABSENT: Next.js build completed without the decorators diagnostic")
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: build exited ${result.code ?? `by signal ${result.signal}`} without the reported decorators diagnostic`)
  process.exitCode = 2
}
