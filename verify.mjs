import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

const port = await availablePort()
const child = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--hostname", "127.0.0.1",
  "--port", String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""
child.stdout.on("data", (chunk) => { output += chunk.toString() })
child.stderr.on("data", (chunk) => { output += chunk.toString() })

async function stopChild() {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
    }),
  ])
}

try {
  const deadline = Date.now() + 120000
  let response
  let body = ""
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the request (code ${child.exitCode})\n${output}`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/draft`)
      body = await response.text()
      break
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }

  if (!response) throw new Error(`Server was not reachable: ${lastError}\n${output}`)

  const caughtByCatchAll = response.status === 200 && body.includes("CATCH_ALL_ROUTE:") && body.includes("api/draft")
  const handledByApiRoute = response.status === 200 && body === "API_DRAFT_ROUTE"

  if (caughtByCatchAll) {
    console.log(`SYMPTOM_PRESENT status=${response.status} route=catch-all`)
    process.exitCode = 0
  } else if (handledByApiRoute) {
    console.log(`SYMPTOM_ABSENT status=${response.status} route=api body=${JSON.stringify(body)}`)
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED status=${response.status} body=${JSON.stringify(body)}\n${output}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error.stack || error)
  process.exitCode = 2
} finally {
  await stopChild()
}
