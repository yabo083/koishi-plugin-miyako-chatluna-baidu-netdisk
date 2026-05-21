const assert = require('node:assert/strict')
const test = require('node:test')
const { appendSharePasswordParam } = require('../lib/index')

test('appendSharePasswordParam embeds the extraction code in Baidu share links', () => {
  assert.equal(
    appendSharePasswordParam('https://pan.baidu.com/s/1abcDEF', 'ddnK'),
    'https://pan.baidu.com/s/1abcDEF?pwd=ddnK',
  )
})

test('appendSharePasswordParam replaces stale pwd while preserving existing query params', () => {
  assert.equal(
    appendSharePasswordParam('https://pan.baidu.com/s/1abcDEF?from=chatluna&pwd=old1', 'mVk2'),
    'https://pan.baidu.com/s/1abcDEF?from=chatluna&pwd=mVk2',
  )
})
