const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const skillDoc = fs.readFileSync(path.resolve(__dirname, '../docs/baidu_netdisk_skill.md'), 'utf8')
const builtIndex = fs.readFileSync(path.resolve(__dirname, '../lib/index.js'), 'utf8')

test('skill instructions expose only tool calls, not download credentials or manual headers', () => {
  for (const forbidden of [
    /\bdlink\b/i,
    /User-Agent/i,
    /aria2/i,
    /curl/i,
    /wget/i,
    /Header/i,
    /Cookie/i,
    /BDUSS/i,
    /STOKEN/i,
    /bdstoken/i,
  ]) {
    assert.equal(forbidden.test(skillDoc), false, `skill doc leaked internal term: ${forbidden}`)
  }
})

test('transfer/download tool description does not offer raw direct-link mode to the agent', () => {
  assert.equal(/rawDlink/i.test(builtIndex), false)
  assert.equal(/下载直链:|下载直链：/.test(builtIndex), false)
})
