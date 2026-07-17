import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const nextBin = require.resolve("next/dist/bin/next")
const port = 3210
const origin = `http://127.0.0.1:${port}`
const symptom = /Could not find the module[\s\S]*React Client Manifest/i
let output = ""
let server
let outcome = 2
let observation = "verification did not complete"

function collect(chunk) {
  output += chunk.toString()
  if (output.length > 200000) output = output.slice(-200000)
}

async function requestPage() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(origin, { signal: controller.signal })
    return { status: response.status, body: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill("SIGTERM")
  const stopped = new Promise((resolve) => server.once("exit", resolve))
  const grace = new Promise((resolve) => setTimeout(resolve, 5000, "timeout"))
  if ((await Promise.race([stopped, grace])) === "timeout" && server.exitCode === null) {
    server.kill("SIGKILL")
    await new Promise((resolve) => server.once("exit", resolve))
  }
}

try {
  await rm(".next", { recursive: true, force: true })
  server = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout.on("data", collect)
  server.stderr.on("data", collect)

  const deadline = Date.now() + 90000
  let lastResponse = null
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before verification (code ${server.exitCode})`)
    }
    try {
      lastResponse = await requestPage()
      const evidence = `${lastResponse.body}\n${output}`
      if (symptom.test(evidence)) {
        outcome = 0
        observation = `observed reported React Client Manifest runtime error (HTTP ${lastResponse.status})`
        break
      }
      if (lastResponse.status === 200 && /Named client component/i.test(lastResponse.body)) {
        outcome = 1
        observation = "page rendered the named Client Component without the reported error"
        break
      }
    } catch {
      // The development server may not be listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (outcome === 2 && lastResponse) {
    observation = `server responded with HTTP ${lastResponse.status}, but yielded neither the reported error nor a successful page`
  }
} catch (error) {
  observation = error instanceof Error ? error.message : String(error)
  outcome = 2
} finally {
  process.exitCode = outcome
  console.log(observation)
  await stopServer()
}
