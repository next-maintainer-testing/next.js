import { spawn } from "node:child_process"

const port = 31000 + (process.pid % 10000)
const url = `http://127.0.0.1:${port}/cms/test`
const logs = []
let child
let resultCode = 2

function remember(chunk) {
  logs.push(String(chunk))
  if (logs.length > 100) logs.shift()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestPage() {
  const deadline = Date.now() + 120_000
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with ${child.exitCode}\n${logs.join("")}`)
    }

    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${logs.join("")}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return

  const closed = new Promise((resolve) => child.once("close", resolve))
  child.kill("SIGTERM")

  const stopped = await Promise.race([
    closed.then(() => true),
    delay(10_000).then(() => false),
  ])

  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL")
    await closed
  }
}

try {
  child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  )
  child.stdout.on("data", remember)
  child.stderr.on("data", remember)

  const response = await requestPage()
  const body = await response.text()

  if (response.status === 404) {
    console.log("Symptom absent: /cms/test returned the expected 404 response")
    resultCode = 1
  } else if (body.includes("BUG: dynamic page rendered without static props")) {
    console.log(`Symptom present: /cms/test returned ${response.status} and rendered the page without getStaticProps data`)
    resultCode = 0
  } else {
    console.error(`Check failed: unexpected status ${response.status}; response did not contain the reproduction marker`)
    console.error(body.slice(0, 1000))
    resultCode = 2
  }
} catch (error) {
  console.error("Check failed:", error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
}
