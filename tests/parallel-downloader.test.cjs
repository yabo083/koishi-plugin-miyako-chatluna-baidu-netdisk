const assert = require('node:assert/strict')
const test = require('node:test')
const {
  collectParallelRangeDownload,
  parseHttpRange,
  planRanges,
  streamParallelRangeDownload,
} = require('../lib/downloader')

test('planRanges splits requests into bounded chunks', () => {
  assert.deepEqual(planRanges(0, 12 * 1024 * 1024 - 1, 5 * 1024 * 1024), [
    { start: 0, end: 5 * 1024 * 1024 - 1 },
    { start: 5 * 1024 * 1024, end: 10 * 1024 * 1024 - 1 },
    { start: 10 * 1024 * 1024, end: 12 * 1024 * 1024 - 1 },
  ])
})

test('collectParallelRangeDownload fetches chunks concurrently and emits ordered bytes', async () => {
  let active = 0
  let maxActive = 0
  const calls = []

  const chunks = await collectParallelRangeDownload({
    start: 0,
    end: 8,
    chunkSize: 3,
    concurrency: 3,
    fetchRange: async (range) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      calls.push(range)
      await new Promise((resolve) => setTimeout(resolve, range.start === 0 ? 30 : 5))
      active -= 1
      return Buffer.from(`${range.start}${range.end}`)
    },
  })

  assert.equal(maxActive, 3)
  assert.deepEqual(calls, [
    { start: 0, end: 2 },
    { start: 3, end: 5 },
    { start: 6, end: 8 },
  ])
  assert.equal(Buffer.concat(chunks).toString(), '023568')
})

test('parseHttpRange clamps a single byte range to file size', () => {
  assert.deepEqual(parseHttpRange('bytes=10-19', 100), { start: 10, end: 19, partial: true })
  assert.deepEqual(parseHttpRange('bytes=10-', 100), { start: 10, end: 99, partial: true })
  assert.deepEqual(parseHttpRange(undefined, 100), { start: 0, end: 99, partial: false })
})

test('streamParallelRangeDownload yields ordered chunks without waiting for the whole file', async () => {
  let slowChunkResolved = false
  const stream = streamParallelRangeDownload({
    start: 0,
    end: 5,
    chunkSize: 3,
    concurrency: 2,
    fetchRange: async (range) => {
      if (range.start === 3) {
        await new Promise((resolve) => setTimeout(resolve, 40))
        slowChunkResolved = true
      }
      return Buffer.from(`${range.start}${range.end}`)
    },
  })

  const first = await stream.next()
  assert.equal(first.done, false)
  assert.equal(first.value.toString(), '02')
  assert.equal(slowChunkResolved, false)

  const second = await stream.next()
  assert.equal(second.value.toString(), '35')
})
