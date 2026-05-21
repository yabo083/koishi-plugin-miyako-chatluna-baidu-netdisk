const assert = require('node:assert/strict')
const test = require('node:test')
const {
  appendCookieValue,
  BaiduPCSClient,
  generateDevuid,
  generateLocateDownloadSign,
  interpretTransferResponse,
  parseBaiduShareUrl,
} = require('../lib/client')

test('parseBaiduShareUrl accepts normal and captured share URLs', () => {
  assert.deepEqual(parseBaiduShareUrl('https://pan.baidu.com/s/1abc_DEF-123'), {
    surl: 'abc_DEF-123',
    shorturl: 'abc_DEF-123',
    unifiedUrl: 'https://pan.baidu.com/s/1abc_DEF-123',
  })

  assert.deepEqual(parseBaiduShareUrl('https://pan.baidu.com/share/list?shorturl=abc_DEF-123&web=1'), {
    surl: 'abc_DEF-123',
    shorturl: 'abc_DEF-123',
    unifiedUrl: 'https://pan.baidu.com/s/1abc_DEF-123',
  })
})

test('appendCookieValue replaces stale cookie values', () => {
  const cookie = appendCookieValue('BDUSS=ok; BDCLND=old; STOKEN=s', 'BDCLND', 'new-value')

  assert.equal(cookie, 'BDUSS=ok; STOKEN=s; BDCLND=new-value')
})

test('interpretTransferResponse treats duplicated payload as completed', () => {
  const result = interpretTransferResponse({
    errno: 4,
    show_msg: '请求超时，请稍后再试',
    duplicated: {
      list: [{ path: '/acg/galgame/Murasame.zip' }],
      total: 1,
    },
  }, '/acg/galgame', ['Murasame.zip'])

  assert.equal(result.success, true)
  assert.equal(result.duplicate, true)
  assert.deepEqual(result.files, ['/acg/galgame/Murasame.zip'])
})

test('generateLocateDownloadSign follows BaiduPCS locate signature shape', () => {
  assert.equal(generateDevuid('test'), '098F6BCD4621D373CADE4E832627B4F6|0')

  const sign = generateLocateDownloadSign('123456789', 'test_bduss', 1699999999)
  assert.equal(sign.time, 1699999999)
  assert.equal(sign.devuid.endsWith('|0'), true)
  assert.match(sign.rand, /^[a-f0-9]{40}$/)
  assert.equal(sign.urlParams.includes('time=1699999999'), true)
  assert.equal(sign.urlParams.includes('cuid='), true)
})

test('createShare supplies a four-character extraction code for pset when omitted', async () => {
  let requestBody = ''
  const client = new BaiduPCSClient({
    http: {
      post: async (url, body) => {
        assert.equal(url, 'https://pan.baidu.com/share/pset')
        requestBody = body
        const params = new URLSearchParams(body)
        return {
          errno: 0,
          link: 'https://pan.baidu.com/s/1abc',
          shorturl: 'https://pan.baidu.com/s/1abc',
          shareid: 123,
          pwd: params.get('pwd'),
        }
      },
    },
  }, 'BDUSS=test')

  const result = await client.createShare(['/ACG资源/游戏/galgame/Murasame.zip'])
  const params = new URLSearchParams(requestBody)

  assert.equal(params.get('path_list'), JSON.stringify(['/ACG资源/游戏/galgame/Murasame.zip']))
  assert.match(params.get('pwd'), /^[A-Za-z0-9]{4}$/)
  assert.equal(result.pwd, params.get('pwd'))
})
