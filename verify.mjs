import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { readFile, writeFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"

const cwd = process.cwd()
const pagePath = path.join(cwd, "app", "page.js")
const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next")
const eslintBin = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js")
const invalidPage = `export default function Page() {
  const message = "Updated source rendered despite a Prettier lint error";
  return <main>{message}</main>
}
`

let server = null
let devOutput = ""
let result = 2
const originalPage = await readFile(pagePath, "utf8")

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function freePort() {
  const socket = net.createServer()
  socket.listen(0, "127.0.0.1")
  await once(socket, "listening")
  const address = socket.address()
  const port = address.port
  await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())))
  return port
}

async function fetchUntil(url, expectedText, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds
  let lastObservation = "no response"

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" })
      const body = await response.text()
      lastObservation = `HTTP ${response.status}: ${body.slice(0, 300)}`
      if (response.status === 200 && body.includes(expectedText)) return body
    } catch (error) {
      lastObservation = error.message
    }
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${JSON.stringify(expectedText)} (${lastObservation})`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")

  let timer
  const closed = once(child, "close").then(() => "closed")
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 10000)
  })
  const outcome = await Promise.race([closed, timedOut])
  clearTimeout(timer)

  if (outcome === "timeout" && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await once(child, "close")
  }
}

try {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`

  server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout.on("data", (chunk) => {
    devOutput += chunk.toString()
  })
  server.stderr.on("data", (chunk) => {
    devOutput += chunk.toString()
  })

  await fetchUntil(url, "Initial valid source", 90000)
  const outputMarker = devOutput.length
  await writeFile(pagePath, invalidPage)

  const lint = spawnSync(process.execPath, [eslintBin, "app/page.js"], {
    cwd,
    encoding: "utf8",
    timeout: 60000,
  })
  const lintOutput = `${lint.stdout || ""}\n${lint.stderr || ""}`
  if (lint.error || lint.status !== 1 || !lintOutput.includes("prettier/prettier")) {
    throw new Error(`Independent ESLint did not confirm the intended diagnostic (status ${lint.status}): ${lintOutput.slice(0, 1000)}`)
  }

  const body = await fetchUntil(url, "Updated source rendered despite a Prettier lint error", 90000)
  await delay(1500)
  const postEditOutput = devOutput.slice(outputMarker)
  const diagnosticPattern = /prettier\/prettier|Delete `;`|Delete.*semicolon/i
  const terminalHasDiagnostic = diagnosticPattern.test(postEditOutput)
  const responseHasDiagnostic = diagnosticPattern.test(body)

  console.log("Independent ESLint confirmed: prettier/prettier")
  console.log(`next dev terminal diagnostic after edit: ${terminalHasDiagnostic ? "present" : "absent"}`)
  console.log(`rendered response diagnostic after edit: ${responseHasDiagnostic ? "present" : "absent"}`)
  console.log(`updated page rendered: ${body.includes("Updated source rendered despite a Prettier lint error")}`)

  result = terminalHasDiagnostic || responseHasDiagnostic ? 1 : 0
} catch (error) {
  console.error(`Verification check failed: ${error.stack || error}`)
  console.error(`next dev output:\n${devOutput.slice(-4000)}`)
  result = 2
} finally {
  process.exitCode = result
  await writeFile(pagePath, originalPage)
  await stopServer(server)
}
