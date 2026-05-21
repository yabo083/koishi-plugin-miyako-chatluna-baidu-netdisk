import { Readable } from 'stream'

export interface ByteRange {
  start: number
  end: number
}

export interface ParsedHttpRange extends ByteRange {
  partial: boolean
}

export interface ParallelRangeDownloadOptions {
  start: number
  end: number
  chunkSize: number
  concurrency: number
  fetchRange: (range: ByteRange) => Promise<Uint8Array | Buffer>
}

export interface CreateParallelDownloadStreamOptions {
  url: string
  cookie: string
  userAgent?: string
  referer?: string
  start: number
  end: number
  chunkSize?: number
  concurrency?: number
  fetchImpl?: typeof fetch
  forceRange?: boolean
}

export const DEFAULT_RANGE_CHUNK_SIZE = 4 * 1024 * 1024
export const DEFAULT_RANGE_CONCURRENCY = 8

export function planRanges(start: number, end: number, chunkSize = DEFAULT_RANGE_CHUNK_SIZE): ByteRange[] {
  const cleanStart = Math.max(0, Math.floor(start))
  const cleanEnd = Math.max(cleanStart, Math.floor(end))
  const cleanChunkSize = Math.max(1, Math.floor(chunkSize))
  const ranges: ByteRange[] = []

  for (let cursor = cleanStart; cursor <= cleanEnd; cursor += cleanChunkSize) {
    ranges.push({
      start: cursor,
      end: Math.min(cleanEnd, cursor + cleanChunkSize - 1),
    })
  }

  return ranges
}

export function parseHttpRange(rangeHeader: string | undefined, size: number): ParsedHttpRange {
  const endOfFile = Math.max(0, Math.floor(size) - 1)
  if (!rangeHeader) return { start: 0, end: endOfFile, partial: false }

  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return { start: 0, end: endOfFile, partial: false }

  const [, startRaw, endRaw] = match
  if (!startRaw && !endRaw) return { start: 0, end: endOfFile, partial: false }

  if (!startRaw) {
    const suffixLength = Math.max(0, Number(endRaw) || 0)
    return {
      start: Math.max(0, size - suffixLength),
      end: endOfFile,
      partial: true,
    }
  }

  const start = Math.min(Math.max(0, Number(startRaw) || 0), endOfFile)
  const end = endRaw ? Math.min(Number(endRaw) || start, endOfFile) : endOfFile
  return { start, end: Math.max(start, end), partial: true }
}

export async function collectParallelRangeDownload(options: ParallelRangeDownloadOptions): Promise<Buffer[]> {
  const ranges = planRanges(options.start, options.end, options.chunkSize)
  const concurrency = Math.max(1, Math.floor(options.concurrency))
  const results = new Array<Buffer>(ranges.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < ranges.length) {
      const index = nextIndex++
      const data = await options.fetchRange(ranges[index])
      results[index] = Buffer.isBuffer(data) ? data : Buffer.from(data)
    }
  }

  const workerCount = Math.min(concurrency, ranges.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export async function* streamParallelRangeDownload(options: ParallelRangeDownloadOptions): AsyncGenerator<Buffer> {
  const ranges = planRanges(options.start, options.end, options.chunkSize)
  const concurrency = Math.max(1, Math.floor(options.concurrency))
  const inFlight = new Map<number, Promise<Buffer>>()
  let nextToStart = 0
  let nextToYield = 0

  const startOne = () => {
    if (nextToStart >= ranges.length) return
    const index = nextToStart++
    const promise = options.fetchRange(ranges[index])
      .then((data) => Buffer.isBuffer(data) ? data : Buffer.from(data))
    inFlight.set(index, promise)
  }

  while (nextToStart < Math.min(concurrency, ranges.length)) startOne()

  while (nextToYield < ranges.length) {
    const promise = inFlight.get(nextToYield)
    if (!promise) throw new Error(`下载调度错误：缺少分片 #${nextToYield}`)
    const chunk = await promise
    inFlight.delete(nextToYield)
    nextToYield += 1
    startOne()
    yield chunk
  }
}

export async function fetchRangeBuffer(
  url: string,
  range: ByteRange,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<Buffer> {
  const res = await fetchImpl(url, {
    headers: {
      ...headers,
      Range: `bytes=${range.start}-${range.end}`,
    },
  })

  if (res.status !== 206) {
    throw new Error(`Range 请求失败：期望 HTTP 206，实际 HTTP ${res.status}`)
  }

  const contentRange = res.headers.get('content-range') || ''
  const expectedPrefix = `bytes ${range.start}-${range.end}/`
  if (!contentRange.startsWith(expectedPrefix)) {
    throw new Error(`Range 响应不匹配：期望 ${expectedPrefix}，实际 ${contentRange || '<empty>'}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export async function* parallelRangeDownload(options: CreateParallelDownloadStreamOptions): AsyncGenerator<Buffer> {
  const headers: Record<string, string> = {
    'User-Agent': options.userAgent || 'LogStatistic',
    Cookie: options.cookie,
  }
  if (options.referer) headers.Referer = options.referer

  yield* streamParallelRangeDownload({
    start: options.start,
    end: options.end,
    chunkSize: options.chunkSize || DEFAULT_RANGE_CHUNK_SIZE,
    concurrency: options.concurrency || DEFAULT_RANGE_CONCURRENCY,
    fetchRange: (range) => fetchRangeBuffer(options.url, range, headers, options.fetchImpl || fetch),
  })
}

export function createParallelDownloadStream(options: CreateParallelDownloadStreamOptions): Readable {
  return Readable.from(parallelRangeDownload(options))
}

export function createSingleDownloadStream(options: CreateParallelDownloadStreamOptions): Readable {
  async function* run() {
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent || 'LogStatistic',
      Cookie: options.cookie,
    }
    if (options.referer) headers.Referer = options.referer
    if (options.forceRange) {
      headers.Range = `bytes=${options.start}-${options.end}`
    }

    const res = await (options.fetchImpl || fetch)(options.url, { headers })
    if (!res.ok || !res.body) {
      throw new Error(`下载代理请求上游失败，HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield Buffer.from(value)
    }
  }

  return Readable.from(run())
}
