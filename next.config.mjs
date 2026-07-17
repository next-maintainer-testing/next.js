import { fileURLToPath } from "node:url"

const nextConfig = {
  cacheHandler: fileURLToPath(new URL("./cache-handler.cjs", import.meta.url)),
  cacheMaxMemorySize: 0,
}

export default nextConfig
