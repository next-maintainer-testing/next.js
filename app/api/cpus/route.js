export const dynamic = 'force-dynamic'

export async function GET() {
  const serialized = process.env.__NEXT_PRIVATE_STANDALONE_CONFIG
  let configuredCpus = null

  if (serialized) {
    const config = JSON.parse(serialized)
    configuredCpus = config?.experimental?.cpus ?? null
  }

  const runtimeCircleNodeTotal = Number(process.env.CIRCLE_NODE_TOTAL)

  return Response.json({
    configuredCpus,
    runtimeCircleNodeTotal,
    expectedRuntimeCpus: Math.max(1, runtimeCircleNodeTotal - 1),
  })
}
