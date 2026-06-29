/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *browser* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime/runtime-utils.ts" />

// Used in WebWorkers to tell the runtime about the chunk suffix
declare var TURBOPACK_ASSET_SUFFIX: string
// Used in WebWorkers to tell the runtime about the current chunk url since it
// can't be detected via `document.currentScript`. Note it's stored in reversed
// order to use `push` and `pop`
declare var TURBOPACK_NEXT_CHUNK_URLS: ChunkUrl[] | undefined

// Injected by rust code
declare var CHUNK_BASE_PATH: string
declare var ASSET_SUFFIX: string
declare var CROSS_ORIGIN: 'anonymous' | 'use-credentials' | null
declare var TURBOPACK_DEV: boolean
declare var CHUNK_LOAD_RETRY_MAX_ATTEMPTS: number
declare var CHUNK_LOAD_RETRY_BASE_DELAY_MS: number
declare var CHUNK_LOAD_RETRY_MAX_JITTER_MS: number

interface TurbopackBrowserBaseContext<M> extends TurbopackBaseContext<M> {
  R: ResolvePathFromModule
}

const browserContextPrototype =
  Context.prototype as TurbopackBrowserBaseContext<unknown>

// Provided by build or dev base
declare function instantiateModule(
  id: ModuleId,
  sourceType: SourceType,
  sourceData: SourceData
): Module

type RuntimeParams = {
  otherChunks: ChunkData[]
  runtimeModuleIds: ModuleId[]
}

type ChunkRegistrationChunk =
  | ChunkPath
  | { getAttribute: (name: string) => string | null }
  | undefined

type ChunkRegistration = [
  chunkPath: ChunkRegistrationChunk,
  ...([RuntimeParams] | CompressedModuleFactories),
]

type ChunkList = {
  script: ChunkRegistrationChunk
  chunks: ChunkData[]
  source: 'entry' | 'dynamic'
}

interface RuntimeBackend {
  registerChunk: (
    chunkPath: ChunkPath | ChunkScript,
    params?: RuntimeParams
  ) => void
  /**
   * Returns the same Promise for the same chunk URL.
   */
  loadChunkCached: (sourceType: SourceType, chunkUrl: ChunkUrl) => Promise<void>
}

interface DevRuntimeBackend {
  reloadChunk?: (chunkUrl: ChunkUrl) => Promise<void>
  unloadChunk?: (chunkUrl: ChunkUrl) => void
  restart: () => void
}

const moduleFactories: ModuleFactories = new Map()
contextPrototype.M = moduleFactories

const availableModules: Map<ModuleId, Promise<any> | true> = new Map()

const availableModuleChunks: Map<ChunkPath, Promise<any> | true> = new Map()

function loadChunk(
  this: TurbopackBrowserBaseContext<Module>,
  chunkData: ChunkData
): Promise<void> {
  return loadChunkInternal(SourceType.Parent, this.m.id, chunkData)
}
browserContextPrototype.l = loadChunk

function loadInitialChunk(chunkPath: ChunkPath, chunkData: ChunkData) {
  return loadChunkInternal(SourceType.Runtime, chunkPath, chunkData)
}

async function loadChunkInternal(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkData: ChunkData
): Promise<void> {
  if (typeof chunkData === 'string') {
    return loadChunkPath(sourceType, sourceData, chunkData)
  }

  const includedList = chunkData.included || []
  const modulesPromises = includedList.map((included) => {
    if (moduleFactories.has(included)) return true
    return availableModules.get(included)
  })
  if (modulesPromises.length > 0 && modulesPromises.every((p) => p)) {
    // When all included items are already loaded or loading, we can skip loading ourselves
    await Promise.all(modulesPromises)
    return
  }

  const includedModuleChunksList = chunkData.moduleChunks || []
  const moduleChunksPromises = includedModuleChunksList
    .map((included) => {
      // TODO(alexkirsz) Do we need this check?
      // if (moduleFactories[included]) return true;
      return availableModuleChunks.get(included)
    })
    .filter((p) => p)

  let promise: Promise<unknown>
  if (moduleChunksPromises.length > 0) {
    // Some module chunks are already loaded or loading.

    if (moduleChunksPromises.length === includedModuleChunksList.length) {
      // When all included module chunks are already loaded or loading, we can skip loading ourselves
      await Promise.all(moduleChunksPromises)
      return
    }

    const moduleChunksToLoad: Set<ChunkPath> = new Set()
    for (const moduleChunk of includedModuleChunksList) {
      if (!availableModuleChunks.has(moduleChunk)) {
        moduleChunksToLoad.add(moduleChunk)
      }
    }

    for (const moduleChunkToLoad of moduleChunksToLoad) {
      const promise = loadChunkPath(sourceType, sourceData, moduleChunkToLoad)

      availableModuleChunks.set(moduleChunkToLoad, promise)

      moduleChunksPromises.push(promise)
    }

    promise = Promise.all(moduleChunksPromises)
  } else {
    // For a merged chunk (one that lists more than one module chunk), probe the HTTP cache before
    // downloading the whole merged chunk: if enough constituent partials are already cached,
    // load the smaller partials individually instead.
    let cachedPartials: Map<ChunkPath, number> = new Map()
    if (
      !TURBOPACK_DEV &&
      sourceType === SourceType.Parent &&
      includedModuleChunksList.length > 1 &&
      typeof fetch === 'function'
    ) {
      cachedPartials = await probeCachedChunks(includedModuleChunksList)
    }

    if (
      cachedPartials.size > 0 &&
      shouldLoadPartials(includedModuleChunksList.length, cachedPartials)
    ) {
      // Worth splitting: load every partial individually so cached partials are reused.
      const partialPromises: Array<Promise<unknown> | true> = []
      for (const moduleChunk of includedModuleChunksList) {
        let partialPromise = availableModuleChunks.get(moduleChunk)
        if (!partialPromise) {
          partialPromise = loadChunkPath(sourceType, sourceData, moduleChunk)
          availableModuleChunks.set(moduleChunk, partialPromise)
        }
        partialPromises.push(partialPromise)
      }
      promise = Promise.all(partialPromises)
    } else {
      // Cold cache (or a regular, non-merged chunk): load the whole chunk in a single request.
      promise = loadChunkPath(sourceType, sourceData, chunkData.path)
      for (const includedModuleChunk of includedModuleChunksList) {
        if (!availableModuleChunks.has(includedModuleChunk)) {
          availableModuleChunks.set(includedModuleChunk, promise)
        }
      }
    }
  }

  for (const included of includedList) {
    if (!availableModules.has(included)) {
      // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
      // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
      availableModules.set(included, promise)
    }
  }

  await promise
}

const loadedChunk = Promise.resolve(undefined)
const instrumentedBackendLoadChunks = new WeakMap<
  Promise<any>,
  Promise<any> | typeof loadedChunk
>()
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrl(
  this: TurbopackBrowserBaseContext<Module>,
  chunkUrl: ChunkUrl
) {
  return loadChunkByUrlInternal(SourceType.Parent, this.m.id, chunkUrl)
}
browserContextPrototype.L = loadChunkByUrl

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlInternal(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkUrl: ChunkUrl
): Promise<any> {
  const thenable = BACKEND.loadChunkCached(sourceType, chunkUrl)
  let entry = instrumentedBackendLoadChunks.get(thenable)
  if (entry === undefined) {
    const resolve = instrumentedBackendLoadChunks.set.bind(
      instrumentedBackendLoadChunks,
      thenable,
      loadedChunk
    )
    entry = thenable.then(resolve).catch((cause) => {
      let loadReason: string
      switch (sourceType) {
        case SourceType.Runtime:
          loadReason = `as a runtime dependency of chunk ${sourceData}`
          break
        case SourceType.Parent:
          loadReason = `from module ${sourceData}`
          break
        case SourceType.Update:
          loadReason = 'from an HMR update'
          break
        default:
          invariant(
            sourceType,
            (sourceType) => `Unknown source type: ${sourceType}`
          )
      }
      let error = new Error(
        `Failed to load chunk ${chunkUrl} ${loadReason}${
          cause ? `: ${cause}` : ''
        }`,
        cause ? { cause } : undefined
      )
      error.name = 'ChunkLoadError'
      throw error
    })
    instrumentedBackendLoadChunks.set(thenable, entry)
  }

  return entry
}

// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkPath(
  sourceType: SourceType,
  sourceData: SourceData,
  chunkPath: ChunkPath
): Promise<void> {
  const url = getChunkRelativeUrl(chunkPath)
  return loadChunkByUrlInternal(sourceType, sourceData, url)
}

/**
 * Approximate cost of an extra HTTP request, used to decide whether splitting a merged chunk into
 * individually-cached partials is worthwhile. This is the runtime analog of the `c_req`, however,
 * it is expressed in compressed transfer bytes rather than pre-minified (which the chunker's # is).
 */
const REQUEST_COST_BYTES = 30_000

/**
 * Checks the browser HTTP cache (without hitting the network) for given chunk paths using
 * `fetch(..., { cache: 'only-if-cached' })`, and returns a map of the cached paths to their
 * transfer size (`Content-Length`, or `0` when the header is absent).
 *
 * A cache miss surfaces either as a non-`ok` response (e.g. a synthetic 504) or a thrown
 * `TypeError` depending on the browser; both are treated as "not cached". `only-if-cached` requires
 * `same-origin`, which chunks always are.
 */
async function probeCachedChunks(
  chunkPaths: ChunkPath[]
): Promise<Map<ChunkPath, number>> {
  const hits: Map<ChunkPath, number> = new Map()
  await Promise.all(
    chunkPaths.map(async (chunkPath) => {
      if (!isJs(chunkPath)) return
      const url = getChunkRelativeUrl(chunkPath)
      try {
        const response = await fetch(url, {
          cache: 'only-if-cached',
          mode: 'same-origin',
        })
        if (response.ok) {
          const length = Number(response.headers.get('content-length'))
          hits.set(
            chunkPath,
            Number.isFinite(length) && length > 0 ? length : 0
          )
        }
      } catch {
        // Cache miss or `only-if-cached` unsupported: treat as not cached.
      }
    })
  )
  return hits
}

/**
 * Decides whether to load a merged chunk's partials individually instead of the whole merged chunk,
 * weighing the transfer bytes saved (the cached partials we avoid re-downloading) against the extra
 * network requests splitting incurs.
 *
 * Loading partials issues one request per uncached partial vs. a single request for the merged chunk, so
 * splitting adds `uncachedCount - 1` extra network requests. When at most one partial needs the
 * network, splitting never costs more requests than the merged load (and transfers fewer bytes), so
 * it always wins. Otherwise it's only worth it when the cached bytes exceed the extra request cost.
 */
function shouldLoadPartials(
  totalPartials: number,
  cachedPartials: Map<ChunkPath, number>
): boolean {
  const uncachedCount = totalPartials - cachedPartials.size
  if (uncachedCount <= 1) {
    return true
  }
  let cachedBytes = 0
  for (const size of cachedPartials.values()) {
    cachedBytes += size
  }
  return cachedBytes > REQUEST_COST_BYTES * (uncachedCount - 1)
}

/**
 * Returns an absolute url to an asset.
 */
function resolvePathFromModule(
  this: TurbopackBaseContext<Module>,
  moduleId: string
): string {
  const exported = this.r(moduleId)
  return exported?.default ?? exported
}
browserContextPrototype.R = resolvePathFromModule

/**
 * no-op for browser
 * @param modulePath
 */
function resolveAbsolutePath(modulePath?: string): string {
  return `/ROOT/${modulePath ?? ''}`
}
browserContextPrototype.P = resolveAbsolutePath

/**
 * Returns a placeholder `file://` URL for the given module path. The browser
 * runtime intentionally does not expose the real filesystem path. Path
 * segments are percent-encoded so the result is always a valid file URI.
 */
function resolveFileUrl(modulePath?: string): string {
  if (!modulePath) return 'file:///ROOT/'
  return `file:///ROOT/${modulePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
browserContextPrototype.F = resolveFileUrl

/**
 * Exports a URL with the static suffix appended.
 */
function exportUrl(
  this: TurbopackBrowserBaseContext<Module>,
  url: string,
  id: ModuleId | undefined
) {
  exportValue.call(this, `${url}${ASSET_SUFFIX}`, id)
}
browserContextPrototype.q = exportUrl

/**
 * Instantiates a runtime module.
 */
function instantiateRuntimeModule(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): Module {
  return instantiateModule(moduleId, SourceType.Runtime, chunkPath)
}
/**
 * Returns the URL relative to the origin where a chunk can be fetched from.
 */
function getChunkRelativeUrl(
  chunkPath: ChunkPath | ChunkListPath,
  basePath: string = CHUNK_BASE_PATH
): ChunkUrl {
  return `${basePath}${chunkPath
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')}${ASSET_SUFFIX}` as ChunkUrl
}

// Shared runtime primitives consumed by the bundled `createWorker` helper,
// exposed as `__turbopack_chunk_base_path__` and `__turbopack_chunk_asset_suffix__`.
browserContextPrototype.b = CHUNK_BASE_PATH as ChunkBasePath
browserContextPrototype.X = ASSET_SUFFIX as AssetSuffix

// Shared runtime primitive: build a chunk's URL. Used by the bundled worker
// helper and the WASM helper, exposed as `__turbopack_chunk_relative_url__`.
browserContextPrototype.h = getChunkRelativeUrl

/**
 * Return the ChunkPath from a ChunkScript.
 */
function getPathFromScript(chunkScript: ChunkPath | ChunkScript): ChunkPath
function getPathFromScript(
  chunkScript: ChunkListPath | ChunkListScript
): ChunkListPath
function getPathFromScript(
  chunkScript: ChunkPath | ChunkListPath | ChunkScript | ChunkListScript
): ChunkPath | ChunkListPath {
  if (typeof chunkScript === 'string') {
    return chunkScript as ChunkPath | ChunkListPath
  }
  const chunkUrl = chunkScript.src!
  const src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''))
  const path = src.startsWith(CHUNK_BASE_PATH)
    ? src.slice(CHUNK_BASE_PATH.length)
    : src
  return path as ChunkPath | ChunkListPath
}

/**
 * Return the ChunkUrl from a ChunkScript.
 */
function getUrlFromScript(chunk: ChunkPath | ChunkScript): ChunkUrl {
  if (typeof chunk === 'string') {
    return getChunkRelativeUrl(chunk)
  } else {
    // This is already exactly what we want
    return chunk.src! as ChunkUrl
  }
}

/**
 * Determine the chunk to register. Note that this function has side-effects!
 */
function getChunkFromRegistration(
  chunk: ChunkRegistrationChunk
): ChunkPath | CurrentScript {
  if (typeof chunk === 'string') {
    return chunk
  } else if (!chunk) {
    if (typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined') {
      return { src: TURBOPACK_NEXT_CHUNK_URLS.pop()! } as CurrentScript
    } else {
      throw new Error('chunk path empty but not in a worker')
    }
  } else {
    return { src: chunk.getAttribute('src')! } as CurrentScript
  }
}

/**
 * Checks if a given path/URL ends with the given extension,
 * optionally followed by ?query or #fragment.
 */
function endsWithExtension(
  chunkUrlOrPath: ChunkUrl | ChunkPath,
  ext: string
): boolean {
  // Find where the path ends (before query or fragment)
  const q = chunkUrlOrPath.indexOf('?')
  let end: number
  if (q !== -1) {
    end = q
  } else {
    const h = chunkUrlOrPath.indexOf('#')
    end = h !== -1 ? h : chunkUrlOrPath.length
  }
  // Check if the path portion ends with the extension
  return end >= ext.length && chunkUrlOrPath.startsWith(ext, end - ext.length)
}

function isJs(chunkUrlOrPath: ChunkUrl | ChunkPath): boolean {
  return endsWithExtension(chunkUrlOrPath, '.js')
}

function isCss(chunkUrl: ChunkUrl): boolean {
  return endsWithExtension(chunkUrl, '.css')
}
