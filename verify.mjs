import { spawn } from 'node:child_process'
import http from 'node:http'
import http2 from 'node:http2'
import net from 'node:net'
import { rm } from 'node:fs/promises'

const appPort = 31233
const collectorPort = 4317
const suppliedTraceId = '11111111111111111111111111111111'
const suppliedParentId = '2222222222222222'
const appOutput = []
const exportedMessages = []
let app = null
let collector = null
let decided = false

function readVarint(buffer, offset) {
  let value = 0
  let shift = 0
  while (offset < buffer.length && shift <= 49) {
    const byte = buffer[offset++]
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return [value, offset]
    shift += 7
  }
  throw new Error('invalid protobuf varint')
}

function protobufFields(buffer) {
  const fields = []
  let offset = 0
  while (offset < buffer.length) {
    let tag
    ;[tag, offset] = readVarint(buffer, offset)
    const number = Math.floor(tag / 8)
    const wire = tag & 7
    if (!number) throw new Error('invalid protobuf field number')
    if (wire === 0) {
      let value
      ;[value, offset] = readVarint(buffer, offset)
      fields.push({ number, wire, value })
    } else if (wire === 1) {
      if (offset + 8 > buffer.length) throw new Error('truncated fixed64 field')
      fields.push({ number, wire, value: buffer.subarray(offset, offset + 8) })
      offset += 8
    } else if (wire === 2) {
      let length
      ;[length, offset] = readVarint(buffer, offset)
      if (offset + length > buffer.length) throw new Error('truncated bytes field')
      fields.push({ number, wire, value: buffer.subarray(offset, offset + length) })
      offset += length
    } else if (wire === 5) {
      if (offset + 4 > buffer.length) throw new Error('truncated fixed32 field')
      fields.push({ number, wire, value: buffer.subarray(offset, offset + 4) })
      offset += 4
    } else {
      throw new Error(`unsupported protobuf wire type ${wire}`)
    }
  }
  return fields
}

function bytesFields(buffer, number) {
  return protobufFields(buffer)
    .filter((field) => field.number === number && field.wire === 2)
    .map((field) => field.value)
}

function decodeSpans(message) {
  const spans = []
  for (const resourceSpans of bytesFields(message, 1)) {
    for (const scopeSpans of bytesFields(resourceSpans, 2)) {
      for (const encodedSpan of bytesFields(scopeSpans, 2)) {
        const fields = protobufFields(encodedSpan)
        const one = (number) =>
          fields.find((field) => field.number === number && field.wire === 2)?.value
        spans.push({
          traceId: one(1)?.toString('hex') ?? '',
          spanId: one(2)?.toString('hex') ?? '',
          parentSpanId: one(4)?.toString('hex') ?? '',
          name: one(5)?.toString('utf8') ?? '',
        })
      }
    }
  }
  return spans
}

function decodeGrpcFrames(body) {
  const messages = []
  let offset = 0
  while (offset < body.length) {
    if (offset + 5 > body.length) throw new Error('truncated gRPC frame')
    const compressed = body[offset]
    const length = body.readUInt32BE(offset + 1)
    offset += 5
    if (compressed !== 0) throw new Error('compressed OTLP request is unsupported')
    if (offset + length > body.length) throw new Error('truncated gRPC message')
    messages.push(body.subarray(offset, offset + length))
    offset += length
  }
  return messages
}

function startCollector() {
  return new Promise((resolve, reject) => {
    collector = http2.createServer()
    collector.on('stream', (stream, headers) => {
      const chunks = []
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('end', () => {
        try {
          if (headers[':path'] === '/opentelemetry.proto.collector.trace.v1.TraceService/Export') {
            exportedMessages.push(...decodeGrpcFrames(Buffer.concat(chunks)))
          }
          stream.respond({
            ':status': 200,
            'content-type': 'application/grpc',
            'grpc-status': '0',
          })
          stream.end(Buffer.alloc(5))
        } catch (error) {
          appOutput.push(`collector error: ${error.stack || error}`)
          if (!stream.closed) {
            stream.respond({ ':status': 200, 'content-type': 'application/grpc', 'grpc-status': '13' })
            stream.end()
          }
        }
      })
    })
    collector.once('error', reject)
    collector.listen(collectorPort, '127.0.0.1', resolve)
  })
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out`))
    }, options.timeout ?? 180_000)
    child.stdout.on('data', (chunk) => appOutput.push(chunk.toString()))
    child.stderr.on('data', (chunk) => appOutput.push(chunk.toString()))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

function waitForPort(port, timeout = 40_000) {
  const deadline = Date.now() + timeout
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error(`port ${port} did not open`))
        else setTimeout(tryConnect, 200)
      })
    }
    tryConnect()
  })
}

function requestPage() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: appPort,
        path: '/test',
        headers: {
          traceparent: `00-${suppliedTraceId}-${suppliedParentId}-01`,
        },
      },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode))
      }
    )
    request.setTimeout(45_000, () => request.destroy(new Error('request timed out')))
    request.once('error', reject)
  })
}

async function stopApp() {
  if (!app || app.exitCode !== null || app.signalCode !== null) return
  app.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => app.once('exit', resolve)),
    new Promise((resolve) =>
      setTimeout(() => {
        if (app.exitCode === null && app.signalCode === null) app.kill('SIGKILL')
        resolve()
      }, 10_000)
    ),
  ])
}

async function closeCollector() {
  if (!collector) return
  await new Promise((resolve) => collector.close(resolve))
}

try {
  await rm('.next', { recursive: true, force: true })
  await startCollector()
  await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], { timeout: 180_000 })

  app = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-p', String(appPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collectorPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  app.stdout.on('data', (chunk) => appOutput.push(chunk.toString()))
  app.stderr.on('data', (chunk) => appOutput.push(chunk.toString()))

  await waitForPort(appPort)
  const status = await requestPage()
  await new Promise((resolve) => setTimeout(resolve, 8_000))

  const spans = exportedMessages.flatMap(decodeSpans)
  const httpServerSpan = spans.find((span) => span.name === 'GET')
  const nextRequestSpan = spans.find((span) => span.name === 'GET /test')
  const remoteContextWasPropagated = spans.some(
    (span) => span.traceId === suppliedTraceId && span.parentSpanId === suppliedParentId
  )

  console.log(`HTTP status: ${status}`)
  console.log(`Exported spans: ${spans.length}`)
  for (const span of spans) {
    console.log(`${span.traceId} ${span.spanId} parent=${span.parentSpanId || '-'} name=${JSON.stringify(span.name)}`)
  }

  console.log(`Remote trace context propagated: ${remoteContextWasPropagated}`)
  if (httpServerSpan && nextRequestSpan && httpServerSpan.traceId !== nextRequestSpan.traceId) {
    console.log('SYMPTOM PRESENT: one /test request produced separate HTTP-instrumentation and Next.js traces.')
    process.exitCode = 0
  } else {
    console.log('SYMPTOM ABSENT: HTTP instrumentation and Next.js did not produce separate traces for /test.')
    process.exitCode = 1
  }
  decided = true
} catch (error) {
  console.error(error.stack || error)
  console.error(appOutput.join('').slice(-12_000))
  process.exitCode = 2
  decided = true
} finally {
  if (!decided) process.exitCode = 2
  await stopApp()
  await closeCollector()
}
