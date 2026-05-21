import { Context } from 'koishi'
import * as crypto from 'crypto'

export const PAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.75 Safari/537.36'
export const PCS_UA = 'softxm;netdisk'

export interface QuotaInfo {
  quotaTotal: number
  quotaUsed: number
}

export interface UserInfo extends QuotaInfo {
  uid: string
  username: string
  avatar: string
}

export interface SharedFile {
  fs_id: number | string
  server_filename: string
  path: string
  isdir: number
  size: number
}

export interface SharedData {
  shareId: number
  uk: number
  bdstoken: string
  fileList: SharedFile[]
  unifiedUrl: string
}

export interface ParsedShareUrl {
  surl: string
  shorturl: string
  unifiedUrl: string
}

export interface TransferInterpretation {
  success: boolean
  duplicate: boolean
  files: string[]
  targetDir: string
  message: string
}

export interface ShareCreateResult {
  link: string
  shortUrl: string
  shareId: number | string
  period: number
  pwd: string
  files: string[]
}

export function parseBaiduShareUrl(sharedUrl: string): ParsedShareUrl {
  let surl = ''
  try {
    const u = new URL(sharedUrl)
    if (u.pathname.includes('/s/')) {
      surl = u.pathname.substring(u.pathname.indexOf('/s/') + 3).replace(/\/$/, '')
    } else if (u.searchParams.has('surl')) {
      surl = u.searchParams.get('surl') || ''
    } else if (u.searchParams.has('shorturl')) {
      surl = u.searchParams.get('shorturl') || ''
    }
  } catch {
    const m = sharedUrl.match(/pan\.baidu\.com\/s\/(1)?([A-Za-z0-9_-]+)/)
    if (m) surl = m[2]
  }

  surl = surl.replace(/^\//, '')
  const shorturl = surl.startsWith('1') ? surl.slice(1) : surl
  if (!shorturl) {
    throw new Error('无效的百度网盘分享链接，无法提取 surl 标识。')
  }

  return {
    surl: shorturl,
    shorturl,
    unifiedUrl: `https://pan.baidu.com/s/1${shorturl}`,
  }
}

export function normalizeNetdiskPath(path: string): string {
  const clean = String(path || '/').trim().replace(/\\/g, '/')
  if (!clean || clean === '/') return '/'
  return `/${clean.replace(/^\/+|\/+$/g, '')}`
}

export function appendCookieValue(cookie: string, name: string, value: string): string {
  const parts = String(cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.split('=')[0].trim().toLowerCase() !== name.toLowerCase())

  if (value) parts.push(`${name}=${value}`)
  return parts.join('; ')
}

export function normalizeRandskForCookie(randsk: string): string {
  if (!randsk) return ''
  return encodeURIComponent(decodeURIComponent(randsk))
}

export function extractCookieValue(cookie: string, name: string): string {
  const lowerName = name.toLowerCase()
  for (const part of String(cookie || '').split(';')) {
    const trimmed = part.trim()
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    if (trimmed.slice(0, idx).trim().toLowerCase() === lowerName) {
      return trimmed.slice(idx + 1).trim()
    }
  }
  return ''
}

export function generateDevuid(bduss: string): string {
  return `${crypto.createHash('md5').update(bduss).digest('hex').toUpperCase()}|0`
}

export function generateLocateDownloadSign(uid: string | number, bduss: string, time = Math.floor(Date.now() / 1000)) {
  const devuid = generateDevuid(bduss)
  const bdussSha1 = crypto.createHash('sha1').update(bduss).digest('hex')
  const rand = crypto.createHash('sha1')
    .update(bdussSha1)
    .update(String(uid))
    .update('ebrcUYiuxaZv2XGu7KIYKxUrqfnOfpDF')
    .update(String(time))
    .update(devuid)
    .digest('hex')

  return {
    time,
    rand,
    devuid,
    urlParams: `time=${time}&rand=${rand}&devuid=${encodeURIComponent(devuid)}&cuid=${encodeURIComponent(devuid)}`,
  }
}

function createExtractionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let code = ''
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)]
  }
  return code
}

function normalizeExtractionCode(password?: string): string {
  const trimmed = String(password || '').trim()
  if (!trimmed) return createExtractionCode()
  if (!/^[A-Za-z0-9]{4}$/.test(trimmed)) {
    throw new Error('创建分享失败：提取码必须是 4 位字母或数字。')
  }
  return trimmed
}

export function interpretTransferResponse(body: any, targetDir: string, requestedFiles: string[]): TransferInterpretation {
  let errno = body?.errno
  if (body?.info?.[0] && typeof body.info[0].errno === 'number') {
    errno = body.info[0].errno
  }

  const duplicatedFiles = Array.isArray(body?.duplicated?.list)
    ? body.duplicated.list.map((file: any) => file.path || file.server_filename).filter(Boolean)
    : []

  if (errno === 0) {
    return {
      success: true,
      duplicate: false,
      files: requestedFiles,
      targetDir,
      message: `成功将 ${requestedFiles.length} 个文件/文件夹转存至 "${targetDir}" 目录。`,
    }
  }

  if (errno === 12 || duplicatedFiles.length > 0) {
    const files = duplicatedFiles.length > 0 ? duplicatedFiles : requestedFiles
    return {
      success: true,
      duplicate: true,
      files,
      targetDir,
      message: `目标目录已存在同名文件，无需重复转存：${files.join(', ')}`,
    }
  }

  let message = `转存失败，百度服务器返回错误码 ${errno}`
  if (errno === -32) {
    message = '您的网盘剩余空间不足，无法转存。'
  } else if (errno === -33 || errno === 130 || errno === 120) {
    message = '转存文件数量超过单次转存限制（一次最多支持操作999个文件），请减少文件后重试。'
  } else if (errno === 4) {
    message = body?.show_msg || '百度服务器返回请求超时，请稍后重试。'
  } else if (errno === -10 || errno === -2) {
    message = '该分享链接已失效或已过期。'
  } else if (body?.errmsg || body?.show_msg) {
    message = `${body.errmsg || body.show_msg} (代码: ${errno})`
  }

  return {
    success: false,
    duplicate: false,
    files: requestedFiles,
    targetDir,
    message,
  }
}

export class BaiduPCSClient {
  private http: Context['http']
  public cookies: string

  constructor(private ctx: Context, cookies: string) {
    this.cookies = cookies
    this.http = ctx.http
  }

  /**
   * Helper to merge Set-Cookie headers into a local cookie string
   */
  private mergeCookies(setCookieHeaders: string[] | undefined) {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return

    const cookieMap = new Map<string, string>()

    // Parse existing
    if (this.cookies) {
      this.cookies.split(';').forEach((c) => {
        const idx = c.indexOf('=')
        if (idx > 0) {
          const key = c.substring(0, idx).trim()
          const val = c.substring(idx + 1).trim()
          if (key) cookieMap.set(key, val)
        }
      })
    }

    // Parse new ones
    setCookieHeaders.forEach((header) => {
      const parts = header.split(';')
      const firstPart = parts[0]
      const idx = firstPart.indexOf('=')
      if (idx > 0) {
        const key = firstPart.substring(0, idx).trim()
        const val = firstPart.substring(idx + 1).trim()
        if (key) cookieMap.set(key, val)
      }
    })

    this.cookies = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }

  private static responseToString(data: any): string {
    if (data === null || data === undefined) return ''
    if (typeof data === 'string') return data
    if (Buffer.isBuffer(data)) return data.toString('utf-8')
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return new TextDecoder('utf-8').decode(data as any)
    }
    return String(data)
  }

  private mergeSetCookieHeaders(headers: Headers | undefined) {
    const getSetCookie = (headers as any)?.getSetCookie
    if (typeof getSetCookie === 'function') {
      this.mergeCookies(getSetCookie.call(headers))
      return
    }

    const single = headers?.get?.('set-cookie')
    if (single) this.mergeCookies([single])
  }

  private extractBdstokenFromHtml(html: string): string {
    const directPatterns = [
      /"bdstoken"\s*:\s*"([^"]+)"/,
      /bdstoken\s*=\s*["']([^"']+)["']/,
    ]

    for (const pattern of directPatterns) {
      const match = html.match(pattern)
      if (match?.[1]) return match[1]
    }

    const dataBlockPatterns = [
      /locals\.mset\((.+?)\)/s,
      /yunData\.setData\((.+?)\)/s,
    ]
    for (const pattern of dataBlockPatterns) {
      const match = html.match(pattern)
      if (!match?.[1]) continue
      try {
        const data = JSON.parse(match[1])
        if (data?.bdstoken) return String(data.bdstoken)
      } catch {
        // Ignore non-JSON page snippets and try the next extraction path.
      }
    }

    return ''
  }

  /**
   * Test if the provided cookies are valid, and return the UserInfo
   */
  static async testLoginAndGetInfo(ctx: Context, cookies: string): Promise<UserInfo> {
    const logger = ctx.logger('miyako-chatluna-baidu-netdisk')

    // 1. Fetch Quota Info to verify STOKEN (BaiduPCS-Go uses app_id 266719)
    let quotaTotal = 0
    let quotaUsed = 0
    let quotaOk = false
    try {
      const quotaParams = new URLSearchParams({
        method: 'info',
        app_id: '266719',
      })
      const quotaRes = await fetch(`https://pcs.baidu.com/rest/2.0/pcs/quota?${quotaParams}`, {
        headers: {
          'User-Agent': 'netdisk;11.4.5;android-android;11.0;JSbridge4.4.0;LogStatistic',
          'Cookie': cookies,
        },
      })
      const quotaData = await quotaRes.json()
      if (quotaData && typeof quotaData.quota === 'number') {
        quotaTotal = quotaData.quota
        quotaUsed = quotaData.used
        quotaOk = true
      }
    } catch {
      // Ignored
    }

    // 2. Fetch user info via gettemplatevariable
    let uid = '0'
    let username = 'Unknown'
    let photo = ''

    const infoParams = new URLSearchParams({
      clienttype: '0',
      app_id: '250528',
      fields: JSON.stringify(['username', 'photo', 'uk']),
    })
    try {
      const res = await fetch(`https://pan.baidu.com/api/gettemplatevariable?${infoParams}`, {
        headers: {
          'Cookie': cookies,
          'User-Agent': PAN_UA,
        },
      })
      const loginData = await res.json()
      if (loginData && loginData.errno === 0 && loginData.result) {
        username = loginData.result.username || username
        uid = String(loginData.result.uk || uid)
        photo = loginData.result.photo || photo
        logger.info(`[testLogin] gettemplatevariable OK: uid=${uid}, username=${username}`)
      } else {
        logger.info(`[testLogin] gettemplatevariable errno=${loginData?.errno}, falling back to Tieba`)
      }
    } catch (err: any) {
      logger.info(`[testLogin] gettemplatevariable threw: ${err.message}`)
    }

    // 3. Fallback to Tieba API to get UID and Username if pan info failed
    if (uid === '0' || username === 'Unknown') {
      try {
        const bdussMatch = cookies.match(/BDUSS=([^;]+)/)
        if (bdussMatch) {
          const bduss = bdussMatch[1]
          const timestamp = Date.now().toString()
          const data: Record<string, string> = {
            'bdusstoken': bduss + '|null',
            'channel_id': '',
            'channel_uid': '',
            'stErrorNums': '0',
            'subapp_type': 'mini',
            'timestamp': timestamp + '922',
            '_client_type': '2',
            '_client_version': '7.0.0.0',
            '_phone_imei': '123456789012345',
            'from': 'mini_ad_wandoujia',
            'model': 'Pixel 6'
          }
          data['cuid'] = crypto.createHash('md5').update(bduss + '_' + data['_client_version'] + '_' + data['_phone_imei'] + '_' + data['from']).digest('hex').toUpperCase() + '|543210987654321'

          const sortedKeys = Object.keys(data).sort()
          const signStr = sortedKeys.map(k => k + '=' + data[k]).join('') + 'tiebaclient!!!'
          data['sign'] = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase()

          const formParams = new URLSearchParams(data)
          const tiebaRes = await fetch('http://tieba.baidu.com/c/s/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': 'ka=open',
              'net': '1',
              'User-Agent': 'bdtb for Android 6.9.2.1',
              'client_logid': timestamp + '416',
              'Connection': 'Keep-Alive',
            },
            body: formParams
          })

          const tiebaData = await tiebaRes.json()
          if (tiebaData && tiebaData.error_code === '0' && tiebaData.user) {
            uid = String(tiebaData.user.id || uid)
            username = tiebaData.user.name || username
            photo = `https://gss0.bdstatic.com/6LZ1dD3d1sgCo2Kml5_Y_D3/sys/portrait/item/${tiebaData.user.portrait}`
            logger.info(`[testLogin] Tieba fallback OK: uid=${uid}, username=${username}`)
          } else {
            logger.warn(`[testLogin] Tieba fallback returned error_code=${tiebaData?.error_code}, no user object: ${JSON.stringify(tiebaData).substring(0, 200)}`)
          }
        } else {
          logger.warn(`[testLogin] No BDUSS in cookies; Tieba fallback skipped.`)
        }
      } catch (err: any) {
         logger.warn(`[testLogin] Tieba fallback threw: ${err.message}`)
      }
    }

    if (!quotaOk && uid === '0') {
      throw new Error(`Cookies 无效或已过期 (Quota失败，UserInfo获取失败)`)
    }

    const avatar = photo || ''

    return {
      uid,
      username,
      avatar,
      quotaTotal,
      quotaUsed,
    }
  }

  /**
   * Fetch current quota info
   */
  async getQuota(): Promise<QuotaInfo> {
    try {
      const quotaRes = await this.http.get('https://pcs.baidu.com/rest/2.0/pcs/quota', {
        params: {
          method: 'info',
          app_id: '266719',
        },
        headers: {
          'User-Agent': PCS_UA,
          'Cookie': this.cookies,
        },
      })
      return {
        quotaTotal: quotaRes.quota || 0,
        quotaUsed: quotaRes.used || 0,
      }
    } catch (err: any) {
      throw new Error(`获取容量失败: ${err.message || err}`)
    }
  }

  async getBdstoken(): Promise<string> {
    const templateUrl = new URL('https://pan.baidu.com/api/gettemplatevariable')
    templateUrl.searchParams.set('clienttype', '0')
    templateUrl.searchParams.set('app_id', '250528')
    templateUrl.searchParams.set('fields', JSON.stringify(['bdstoken']))

    let templateErrno: any
    let redirectedToPassport = false

    try {
      const res = await fetch(templateUrl, {
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
        },
      })
      this.mergeSetCookieHeaders(res.headers)
      const data = await res.json()
      templateErrno = data?.errno
      const token = String(data?.result?.bdstoken || '')
      if (token && token !== 'null') return token
    } catch {
      // Fall through to the page extraction paths below.
    }

    for (const url of ['https://pan.baidu.com/disk/main', 'https://pan.baidu.com/disk/home']) {
      try {
        const res = await fetch(url, {
          redirect: 'manual',
          headers: {
            'User-Agent': PAN_UA,
            'Cookie': this.cookies,
          },
        })
        this.mergeSetCookieHeaders(res.headers)
        const location = res.headers.get('location') || ''
        if (res.status >= 300 && res.status < 400 && location.includes('passport.baidu.com')) {
          redirectedToPassport = true
          continue
        }

        const html = await res.text()
        const token = this.extractBdstokenFromHtml(html)
        if (token && token !== 'null') return token
      } catch {
        // Try the next known web entrypoint before reporting failure.
      }
    }

    if (redirectedToPassport || templateErrno === -6) {
      throw new Error('未能获取 bdstoken：当前账号的 PCS/移动端登录态仍可用于列目录、转存和下载直链，但网页版 pan.baidu.com 登录态不可用。创建分享链接依赖网页版 bdstoken；请在控制台用“手动 Cookie 登录”导入浏览器 pan.baidu.com 的完整 Cookie，或重新登录到可打开网页版网盘的账号后重试。')
    }

    throw new Error('未能获取 bdstoken：百度未在模板接口或网页版网盘页面返回 token。')
  }

  /**
   * Helper to ensure target directory exists in PCS
   */
  async ensureDir(path: string): Promise<void> {
    const normalizedPath = normalizeNetdiskPath(path)
    if (normalizedPath === '/') return

    const parts = normalizedPath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      try {
        await this.http.get('https://pcs.baidu.com/rest/2.0/pcs/file', {
          params: {
            method: 'mkdir',
            path: current,
            app_id: '266719',
          },
          headers: {
            'User-Agent': PCS_UA,
            'Cookie': this.cookies,
          },
        })
      } catch (err) {
        // PCS mkdir returns an error if the directory already exists. Treat
        // directory creation as best-effort so transfer can decide final state.
      }
    }
  }

  /**
   * Extract surl and unify URL
   */
  private parseSharedUrl(url: string): ParsedShareUrl {
    return parseBaiduShareUrl(url)
  }

  /**
   * Verify the share password (extraction code) and fetch cookies
   */
  private async accessShared(unifiedUrl: string, surl: string, password?: string): Promise<void> {
    if (!password) return

    const verifyUrl = 'https://pan.baidu.com/share/verify'
    const params = {
      surl,
      t: Date.now().toString(),
      channel: 'chunlei',
      web: '1',
      bdstoken: 'null',
      app_id: '250528',
      logid: '',
      clienttype: '0',
      'dp-logid': Date.now().toString() + Math.floor(1000000 + Math.random() * 9000000).toString(),
    }

    const data = new URLSearchParams()
    data.append('pwd', password)
    data.append('vcode', '')
    data.append('vcode_str', '')

    const res = await this.http.axios({
      method: 'POST',
      url: verifyUrl,
      params,
      data: data.toString(),
      headers: {
        'User-Agent': PAN_UA,
        'Referer': `https://pan.baidu.com/share/init?surl=${surl}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.cookies,
      },
    })

    const body = res.data
    if (body.errno !== 0) {
      if (body.errno === -9) {
        throw new Error('提取码不正确，请检查输入。')
      }
      if (body.errno === -12) {
        throw new Error('该分享链接已失效或已过期。')
      }
      throw new Error(`提取码验证失败，错误码: ${body.errno}`)
    }

    if (body.randsk) {
      this.cookies = appendCookieValue(this.cookies, 'BDCLND', normalizeRandskForCookie(String(body.randsk)))
    }

    // Merge response cookies (like BDCLND) which are crucial for accessing the share page
    let setCookies: string[] | undefined
    if (res.headers) {
      if (typeof (res.headers as any).getSetCookie === 'function') {
        setCookies = (res.headers as any).getSetCookie()
      } else {
        const val = (res.headers as any)['set-cookie'] || (res.headers as any).get?.('set-cookie')
        if (val) {
          setCookies = Array.isArray(val) ? val : [val]
        }
      }
    }
    this.mergeCookies(setCookies)
  }

  /**
   * Fetch share page and retrieve files list, shareid, uk, bdstoken
   */
  private async getSharedPaths(unifiedUrl: string, surl: string): Promise<SharedData> {
    let pageData: any = null
    let pageBdstoken = ''

    try {
      const res = await this.http.axios({
        method: 'GET',
        url: unifiedUrl,
        redirect: 'manual',
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
          'Referer': 'https://pan.baidu.com/',
        },
      })

      let setCookies2: string[] | undefined
      if (res.headers) {
        if (typeof (res.headers as any).getSetCookie === 'function') {
          setCookies2 = (res.headers as any).getSetCookie()
        } else {
          const val = (res.headers as any)['set-cookie'] || (res.headers as any).get?.('set-cookie')
          if (val) {
            setCookies2 = Array.isArray(val) ? val : [val]
          }
        }
      }
      this.mergeCookies(setCookies2)

      const html = BaiduPCSClient.responseToString(res.data)
      if (html.includes('分享文件已过期') || html.includes('链接已失效')) {
        throw new Error('该分享链接已过期或已被分享者取消。')
      }
      if (html.includes('链接不存在')) {
        throw new Error('该分享链接不存在或已被删除。')
      }

      const tokenMatch = html.match(/"bdstoken"\s*:\s*"([^"]+)"/) || html.match(/bdstoken\s*=\s*["']([^"']+)["']/)
      if (tokenMatch && tokenMatch[1] !== 'null') pageBdstoken = tokenMatch[1]

      const match = html.match(/(?:yunData\.setData|locals\.mset)\((.+?)\);/)
      if (match) {
        pageData = JSON.parse(match[1])
        pageBdstoken = String(pageData.bdstoken || pageBdstoken || '')
      }
    } catch (err: any) {
      if (String(err?.message || '').includes('分享链接')) throw err
    }

    const pageFileList = this.extractFileList(pageData)
    const pageShareId = Number(pageData?.shareid || pageData?.share_id || 0)
    const pageUk = Number(pageData?.share_uk || pageData?.uk || 0)

    if (pageShareId && pageUk && pageFileList.length > 0) {
      return {
        shareId: pageShareId,
        uk: pageUk,
        bdstoken: pageBdstoken,
        fileList: pageFileList,
        unifiedUrl,
      }
    }

    return await this.fetchShareList(unifiedUrl, surl, pageBdstoken)
  }

  private extractFileList(sharedData: any): SharedFile[] {
    if (!sharedData) return []
    if (Array.isArray(sharedData.file_list)) return sharedData.file_list
    if (sharedData.file_list && Array.isArray(sharedData.file_list.list)) return sharedData.file_list.list
    if (Array.isArray(sharedData.list)) return sharedData.list
    return []
  }

  private async fetchShareList(unifiedUrl: string, surl: string, bdstoken: string): Promise<SharedData> {
    const listUrl = new URL('https://pan.baidu.com/share/list')
    listUrl.searchParams.append('web', '5')
    listUrl.searchParams.set('app_id', '250528')
    listUrl.searchParams.set('desc', '1')
    listUrl.searchParams.set('showempty', '0')
    listUrl.searchParams.set('page', '1')
    listUrl.searchParams.set('num', '1000')
    listUrl.searchParams.set('order', 'time')
    listUrl.searchParams.set('shorturl', surl)
    listUrl.searchParams.set('root', '1')
    listUrl.searchParams.set('view_mode', '1')
    listUrl.searchParams.set('channel', 'chunlei')
    listUrl.searchParams.append('web', '1')
    listUrl.searchParams.set('bdstoken', bdstoken || '')
    listUrl.searchParams.set('logid', '')
    listUrl.searchParams.set('clienttype', '0')
    listUrl.searchParams.set('dp-logid', Date.now().toString() + Math.floor(1000000 + Math.random() * 9000000).toString())

    const res = await this.http.get(listUrl.toString(), {
      headers: {
        'User-Agent': PAN_UA,
        'Cookie': this.cookies,
        'Referer': unifiedUrl,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
    })

    if (res?.errno !== 0) {
      if (res?.errno === -9) throw new Error('提取码验证失败，请检查提取码或重新验证分享链接。')
      if (res?.errno === -12 || res?.errno === -10 || res?.errno === -2) throw new Error('该分享链接已失效或已过期。')
      throw new Error(`获取分享文件列表失败，百度返回错误码: ${res?.errno}, ${res?.show_msg || res?.errmsg || ''}`)
    }

    const fileList = this.extractFileList(res)
    const shareId = Number(res.share_id || res.shareid || 0)
    const uk = Number(res.uk || res.share_uk || 0)
    if (!shareId || !uk) {
      throw new Error('未能从分享列表接口提取到有效的 share_id 或 uk。')
    }

    return {
      shareId,
      uk,
      bdstoken: bdstoken || String(res.bdstoken || ''),
      fileList,
      unifiedUrl,
    }
  }

  /**
   * Perform the file transfer
   */
  async transfer(
    sharedUrl: string,
    password?: string,
    savePath: string = '/'
  ): Promise<{ success: boolean; files: string[]; targetDir: string; message: string }> {
    const cleanUrl = sharedUrl.trim()
    const parsedUrl = new URL(cleanUrl)
    const passwordFromUrl = parsedUrl.searchParams.get('pwd') || parsedUrl.searchParams.get('password') || undefined
    const cleanPassword = password?.trim() || passwordFromUrl?.trim() || undefined
    const cleanSavePath = normalizeNetdiskPath(savePath)

    // 1. Parse URL
    const { surl, unifiedUrl } = this.parseSharedUrl(cleanUrl)

    // 2. Ensure active login & verification
    await this.accessShared(unifiedUrl, surl, cleanPassword)

    // 3. Get shared files information
    const sharedData = await this.getSharedPaths(unifiedUrl, surl)
    if (sharedData.fileList.length === 0) {
      throw new Error('分享链接中没有任何可供转存的文件。')
    }

    // 4. Ensure save directory exists
    await this.ensureDir(cleanSavePath)

    // 5. Build file lists
    const fsIds = sharedData.fileList.map((f) => f.fs_id)
    const fileNames = sharedData.fileList.map((f) => f.server_filename)

    // 6. Transfer files
    const transferUrl = 'https://pan.baidu.com/share/transfer'
    const params = {
      shareid: sharedData.shareId.toString(),
      from: sharedData.uk.toString(),
      bdstoken: sharedData.bdstoken,
      channel: 'chunlei',
      clienttype: '0',
      web: '1',
    }

    const data = new URLSearchParams()
    data.append('fsidlist', JSON.stringify(fsIds))
    data.append('path', cleanSavePath)

    const response = await this.http.post(transferUrl, data.toString(), {
      params,
      headers: {
        'User-Agent': PAN_UA,
        'Referer': unifiedUrl,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': this.cookies,
      },
    })

    const body = response?.data ?? response
    const interpreted = interpretTransferResponse(body, cleanSavePath, fileNames)
    if (interpreted.success) {
      return {
        success: true,
        files: interpreted.files,
        targetDir: cleanSavePath,
        message: interpreted.message,
      }
    }
    throw new Error(interpreted.message)
  }

  /**
   * List files in a directory
   */
  async listFiles(dir: string = '/'): Promise<any[]> {
    try {
      const res = await this.http.get('https://pan.baidu.com/api/list', {
        params: {
          dir,
          order: 'time',
          desc: '1',
          web: '1',
          showempty: '1',
        },
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
        },
      })
      if (res && res.errno === 0) {
        return res.list || []
      }
      throw new Error(`错误码: ${res?.errno}`)
    } catch (err: any) {
      throw new Error(`获取文件列表失败: ${err.message || err}`)
    }
  }

  /**
   * Search files in Netdisk
   */
  async searchFiles(key: string, dir: string = '/'): Promise<any[]> {
    try {
      const res = await this.http.get('https://pan.baidu.com/api/search', {
        params: {
          key,
          dir,
          recursion: '1',
          web: '1',
        },
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
        },
      })
      if (res && res.errno === 0) {
        return res.list || []
      }
      throw new Error(`错误码: ${res?.errno}`)
    } catch (err: any) {
      throw new Error(`搜索文件失败: ${err.message || err}`)
    }
  }

  /**
   * Get direct download link for a file path
   */
  async getLocateDownloadLinks(path: string, uid: string | number): Promise<string[]> {
    const bduss = extractCookieValue(this.cookies, 'BDUSS')
    if (!bduss || !uid || String(uid) === '0') return []

    const sign = generateLocateDownloadSign(uid, bduss)
    const url = new URL('https://pcs.baidu.com/rest/2.0/pcs/file')
    url.searchParams.set('ant', '1')
    url.searchParams.set('check_blue', '1')
    url.searchParams.set('es', '1')
    url.searchParams.set('esl', '1')
    url.searchParams.set('app_id', '250528')
    url.searchParams.set('method', 'locatedownload')
    url.searchParams.set('path', normalizeNetdiskPath(path))
    url.searchParams.set('ver', '4.0')
    url.searchParams.set('clienttype', '17')
    url.searchParams.set('channel', '0')
    url.searchParams.set('apn_id', '1_0')
    url.searchParams.set('freeisp', '0')
    url.searchParams.set('queryfree', '0')
    url.searchParams.set('use', '0')
    url.searchParams.set('time', String(sign.time))
    url.searchParams.set('rand', sign.rand)
    url.searchParams.set('devuid', sign.devuid)
    url.searchParams.set('cuid', sign.devuid)

    const res = await this.http.axios({
      method: 'POST',
      url: url.toString(),
      headers: {
        'User-Agent': 'netdisk;P2SP;3.0.0.8;netdisk;11.12.3;ANG-AN00;android-android;10.0;JSbridge4.4.0;jointBridge;1.1.0;',
        'Cookie': this.cookies,
      },
    })
    const body = res?.data ?? res
    if (body?.errno && body.errno !== 0) {
      throw new Error(`locatedownload 错误码: ${body.errno}${body.errmsg ? `：${body.errmsg}` : ''}`)
    }

    const urls = Array.isArray(body?.urls)
      ? body.urls
        .filter((item: any) => Number(item?.encrypt || 0) === 0 && item?.url)
        .map((item: any) => String(item.url))
      : []
    return urls
  }

  async getDownloadLinkByPath(path: string, uid?: string | number): Promise<any> {
    try {
      const res = await this.http.get('https://pan.baidu.com/api/filemetas', {
        params: {
          target: JSON.stringify([path]),
          dlink: '1',
        },
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
        },
      })
      // Baidu returns the metadata array under `info`, not `list`.
      const arr = res?.info || res?.list
      if (Array.isArray(arr) && arr.length > 0) {
        const item = arr[0]
        let dlink = item.dlink
        if (uid && item.isdir !== 1) {
          try {
            const locateLinks = await this.getLocateDownloadLinks(path, uid)
            if (locateLinks.length > 0) {
              const preferred = locateLinks.find((url) => !/^https?:\/\/nb\.cache/i.test(url)) || locateLinks[0]
              dlink = preferred
            }
          } catch {
            // Keep the filemetas dlink as a compatibility fallback.
          }
        }
        return {
          filename: item.server_filename || item.filename || path.split('/').pop(),
          path: item.path,
          size: item.size,
          dlink,
          isdir: item.isdir,
        }
      }
      throw new Error('未找到该路径下的文件')
    } catch (err: any) {
      throw new Error(`获取下载直链失败: ${err.message || err}`)
    }
  }

  async getFileMetas(paths: string[], withDlink = false): Promise<any[]> {
    const normalizedPaths = paths.map((path) => normalizeNetdiskPath(path))
    const res = await this.http.get('https://pan.baidu.com/api/filemetas', {
      params: {
        target: JSON.stringify(normalizedPaths),
        dlink: withDlink ? '1' : '0',
      },
      headers: {
        'User-Agent': PAN_UA,
        'Cookie': this.cookies,
      },
    })

    const arr = res?.info || res?.list
    if (res?.errno && res.errno !== 0) {
      const nestedErrno = Array.isArray(arr) ? arr.find((item: any) => item?.errno)?.errno : undefined
      throw new Error(`获取文件元信息失败，百度返回错误码 ${res.errno}${nestedErrno ? ` / ${nestedErrno}` : ''}。`)
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('未找到要操作的文件或文件夹，请检查路径是否正确。')
    }
    const invalid = arr.find((item: any) => item?.errno && item.errno !== 0)
    if (invalid) {
      throw new Error(`未找到要操作的文件或文件夹，百度返回文件级错误码 ${invalid.errno}。`)
    }
    return arr
  }

  async createShare(paths: string[], period = 7, password?: string): Promise<ShareCreateResult> {
    const allowedPeriods = new Set([0, 1, 7, 30])
    const normalizedPeriod = allowedPeriods.has(Number(period)) ? Number(period) : 7
    const normalizedPaths = paths.map((path) => normalizeNetdiskPath(path))
    const normalizedPassword = normalizeExtractionCode(password)
    if (normalizedPaths.length === 0) {
      throw new Error('创建分享失败：请提供至少一个网盘路径。')
    }

    const psetData = new URLSearchParams()
    psetData.append('path_list', JSON.stringify(normalizedPaths))
    psetData.append('period', String(normalizedPeriod))
    psetData.append('schannel', '4')
    psetData.append('channel_list', '[]')
    psetData.append('share_type', '9')
    psetData.append('pwd', normalizedPassword)

    try {
      const response = await this.http.post('https://pan.baidu.com/share/pset', psetData.toString(), {
        headers: {
          'User-Agent': PAN_UA,
          'Cookie': this.cookies,
          'Referer': 'https://pan.baidu.com/disk/home',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      })

      const body = response?.data ?? response
      if (body?.errno === 0) {
        return {
          link: String(body?.link || body?.share_url || body?.shortlink || ''),
          shortUrl: String(body?.shorturl || body?.short_url || ''),
          shareId: body?.shareid || body?.share_id || '',
          period: normalizedPeriod,
          pwd: String(body?.pwd || body?.password || normalizedPassword),
          files: normalizedPaths,
        }
      }

      const msg = body?.show_msg || body?.errmsg || body?.error_msg || ''
      throw new Error(`百度返回错误码 ${body?.errno}${msg ? `：${msg}` : ''}`)
    } catch (psetErr: any) {
      const metas = await this.getFileMetas(normalizedPaths)
      const fsIds = metas.map((item) => item.fs_id).filter(Boolean)
      if (fsIds.length === 0) {
        throw new Error('创建分享失败：未能解析文件 fs_id。')
      }

      let bdstoken = ''
      try {
        bdstoken = await this.getBdstoken()
      } catch (tokenErr: any) {
        throw new Error(`创建分享失败：路径分享接口 /share/pset 失败（${psetErr?.message || psetErr}）；兼容接口 /share/set 无法继续（${tokenErr?.message || tokenErr}）。`)
      }
      const data = new URLSearchParams()
      data.append('fid_list', JSON.stringify(fsIds))
      data.append('schannel', '4')
      data.append('channel_list', '[]')
      data.append('period', String(normalizedPeriod))
      data.append('pwd', normalizedPassword)

      try {
        const response = await this.http.post('https://pan.baidu.com/share/set', data.toString(), {
          params: {
            channel: 'chunlei',
            web: '1',
            app_id: '250528',
            bdstoken,
            logid: '',
            clienttype: '0',
          },
          headers: {
            'User-Agent': PAN_UA,
            'Cookie': this.cookies,
            'Referer': 'https://pan.baidu.com/disk/main',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
        })

        const body = response?.data ?? response
        if (body?.errno !== 0) {
          const msg = body?.show_msg || body?.errmsg || body?.error_msg || ''
          throw new Error(`百度返回错误码 ${body?.errno}${msg ? `：${msg}` : ''}`)
        }

        return {
          link: String(body?.link || body?.share_url || body?.shortlink || ''),
          shortUrl: String(body?.shorturl || body?.short_url || ''),
          shareId: body?.shareid || body?.share_id || '',
          period: normalizedPeriod,
          pwd: String(body?.pwd || body?.password || normalizedPassword),
          files: metas.map((item) => item.path || item.server_filename).filter(Boolean),
        }
      } catch (setErr: any) {
        throw new Error(`创建分享失败：路径分享接口 /share/pset 失败（${psetErr?.message || psetErr}）；兼容接口 /share/set 也失败（${setErr?.message || setErr}）。`)
      }
    }
  }

  /**
   * Delete files or folders via the PCS API.
   * Uses BDUSS+app_id auth (no bdstoken required — same auth surface as mkdir).
   */
  async deleteFiles(paths: string[]): Promise<void> {
    try {
      const body = new URLSearchParams()
      body.append('param', JSON.stringify({ list: paths.map((p) => ({ path: p })) }))

      const res = await this.http.axios({
        method: 'POST',
        url: 'https://pcs.baidu.com/rest/2.0/pcs/file',
        params: { method: 'delete', app_id: '266719' },
        data: body.toString(),
        headers: {
          'User-Agent': PCS_UA,
          'Cookie': this.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const resData = res.data
      // Baidu treats async-batched file ops with error_code 31061 sometimes;
      // top-level success is when no error_code is reported.
      if (!resData || !resData.error_code) return
      throw new Error(`PCS error_code: ${resData.error_code}, message: ${resData.error_msg || ''}`)
    } catch (err: any) {
      throw new Error(`删除文件失败: ${err.message || err}`)
    }
  }

  /**
   * Rename a single file or folder.
   * Implemented via PCS move (rename via move-to-same-parent) because the
   * PCS rename method returns error_code 31296 ("internal error") under
   * BDUSS-only auth for reasons that aren't externally documented.
   */
  async renameFile(path: string, newName: string): Promise<void> {
    try {
      const idx = path.lastIndexOf('/')
      if (idx < 0) throw new Error('path 必须是以 "/" 开头的绝对路径')
      const parent = idx === 0 ? '/' : path.substring(0, idx)
      const to = (parent === '/' ? '' : parent) + '/' + newName

      const body = new URLSearchParams()
      body.append('param', JSON.stringify({ list: [{ from: path, to }] }))

      const res = await this.http.axios({
        method: 'POST',
        url: 'https://pcs.baidu.com/rest/2.0/pcs/file',
        params: { method: 'move', app_id: '266719' },
        data: body.toString(),
        headers: {
          'User-Agent': PCS_UA,
          'Cookie': this.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const resData = res.data
      if (!resData || !resData.error_code) return
      throw new Error(`PCS error_code: ${resData.error_code}, message: ${resData.error_msg || ''}`)
    } catch (err: any) {
      throw new Error(`重命名失败: ${err.message || err}`)
    }
  }

  /**
   * Move files or folders to a target directory via the PCS API.
   */
  async moveFiles(paths: string[], destDir: string): Promise<void> {
    try {
      const list = paths.map((p) => {
        const parts = p.split('/')
        const filename = parts.pop()
        const to = (destDir.endsWith('/') ? destDir : destDir + '/') + filename
        return { from: p, to }
      })
      const body = new URLSearchParams()
      body.append('param', JSON.stringify({ list }))

      const res = await this.http.axios({
        method: 'POST',
        url: 'https://pcs.baidu.com/rest/2.0/pcs/file',
        params: { method: 'move', app_id: '266719' },
        data: body.toString(),
        headers: {
          'User-Agent': PCS_UA,
          'Cookie': this.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const resData = res.data
      if (!resData || !resData.error_code) return
      throw new Error(`PCS error_code: ${resData.error_code}, message: ${resData.error_msg || ''}`)
    } catch (err: any) {
      throw new Error(`移动文件失败: ${err.message || err}`)
    }
  }

  async copyFiles(paths: string[], destDir: string): Promise<void> {
    try {
      const cleanDestDir = normalizeNetdiskPath(destDir)
      const list = paths.map((path) => {
        const cleanPath = normalizeNetdiskPath(path)
        const parts = cleanPath.split('/')
        const filename = parts.pop()
        const to = (cleanDestDir.endsWith('/') ? cleanDestDir : cleanDestDir + '/') + filename
        return { from: cleanPath, to }
      })
      const body = new URLSearchParams()
      body.append('param', JSON.stringify({ list }))

      const res = await this.http.axios({
        method: 'POST',
        url: 'https://pcs.baidu.com/rest/2.0/pcs/file',
        params: { method: 'copy', app_id: '266719' },
        data: body.toString(),
        headers: {
          'User-Agent': PCS_UA,
          'Cookie': this.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      const resData = res.data
      if (!resData || !resData.error_code) return
      throw new Error(`PCS error_code: ${resData.error_code}, message: ${resData.error_msg || ''}`)
    } catch (err: any) {
      throw new Error(`复制文件失败: ${err.message || err}`)
    }
  }

  /**
   * Start QR code login flow.
   * Returns { sign, imgUrl, cookies }
   */
  static async startQRLogin(ctx: Context): Promise<{ sign: string; imgUrl: string; cookies: string }> {
    const url = 'https://passport.baidu.com/v2/api/getqrcode'
    const tt = Date.now().toString()
    const callback = `tangram_guid_${tt}`
    
    const queryParams = new URLSearchParams({
      lp: 'pc',
      qrloginfrom: 'pc',
      tpl: 'netdisk',
      apiver: 'v3',
      tt,
      callback,
      _: tt,
    })

    const res = await fetch(`${url}?${queryParams}`, {
      method: 'GET',
      headers: {
        'User-Agent': PAN_UA,
      },
      redirect: 'manual',
    })

    const text = await res.text()
    const match = text.match(/\((.+)\)/s)
    if (!match) {
      throw new Error('获取二维码响应格式错误')
    }

    const data = JSON.parse(match[1])
    if (!data.sign) {
      throw new Error('未获取到二维码 sign')
    }

    // Extract cookies
    const setCookies = res.headers.getSetCookie()

    const cookies = setCookies
      .map((header) => {
        const parts = header.split(';')
        return parts[0].trim()
      })
      .join('; ')

    return {
      sign: data.sign,
      imgUrl: 'https://' + data.imgurl,
      cookies,
    }
  }

  /**
   * Poll QR code login status.
   * Returns { status: 'waiting' | 'scanned' | 'success', cookies?: string }
   */
  static async pollQRLogin(
    ctx: Context,
    sign: string,
    tempCookies: string
  ): Promise<{ status: 'waiting' | 'scanned' | 'success'; cookies?: string }> {
    const url = 'https://passport.baidu.com/channel/unicast'
    const tt = Date.now().toString()
    const callback = `tangram_guid_${tt}`

    const queryParams = new URLSearchParams({
      channel_id: sign,
      tpl: 'netdisk',
      apiver: 'v3',
      tt,
      callback,
      _: tt,
    })

    const res = await fetch(`${url}?${queryParams}`, {
      method: 'GET',
      headers: {
        'User-Agent': PAN_UA,
        'Cookie': tempCookies,
      },
      redirect: 'manual',
    })

    const text = await res.text()
    const match = text.match(/\((.+)\)/s)
    if (!match) {
      throw new Error('扫码轮询响应格式错误')
    }

    const data = JSON.parse(match[1])
    if (data.errno !== 0 && data.errno !== 1) {
      throw new Error(`扫码出错，代码: ${data.errno}`)
    }

    // Merge any new cookies set during unicast
    let setCookies: string[] = []
    if (typeof res.headers.getSetCookie === 'function') {
      setCookies = res.headers.getSetCookie()
    }

    // Merge existing and new
    const cookieMap = new Map<string, string>()
    const parse = (cStr: string) => {
      if (!cStr) return
      cStr.split(';').forEach((c) => {
        const idx = c.indexOf('=')
        if (idx > 0) {
          const key = c.substring(0, idx).trim()
          const val = c.substring(idx + 1).trim()
          if (key) cookieMap.set(key, val)
        }
      })
    }
    parse(tempCookies)
    setCookies.forEach((header) => {
      const parts = header.split(';')
      const firstPart = parts[0]
      const idx = firstPart.indexOf('=')
      if (idx > 0) {
        const key = firstPart.substring(0, idx).trim()
        const val = firstPart.substring(idx + 1).trim()
        if (key) cookieMap.set(key, val)
      }
    })
    const mergedTempCookies = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

    if (!data.channel_v) {
      return { status: 'waiting' }
    }

    let channelVal: any
    try {
      channelVal = JSON.parse(data.channel_v)
    } catch {
      return { status: 'waiting' }
    }

    if (channelVal.status === 1) {
      return { status: 'scanned' }
    }

    if ((channelVal.status === 0 || channelVal.status === 2) && channelVal.v) {
      const finalCookies = await this.exchangeQRBDUSS(ctx, channelVal.v, mergedTempCookies)
      return {
        status: 'success',
        cookies: finalCookies,
      }
    }

    return { status: 'waiting' }
  }

  /**
   * Final exchange of temporary token (v) for actual BDUSS cookie.
   */
  private static async exchangeQRBDUSS(ctx: Context, vToken: string, tempCookies: string): Promise<string> {
    const logger = ctx.logger('miyako-chatluna-baidu-netdisk')
    const url = 'https://passport.baidu.com/v3/login/main/qrbdusslogin'
    const tt = Date.now().toString()

    const queryParams = new URLSearchParams({
      bduss: vToken,
      tpl: 'netdisk',
      apiver: 'v3',
      tt,
      alg: 'v3',
      sig: '',
      elapsed: '0',
      shaession: '',
    })

    const res = await fetch(`${url}?${queryParams}`, {
      method: 'GET',
      headers: {
        'User-Agent': PAN_UA,
        'Cookie': tempCookies,
      },
      redirect: 'manual',
    })

    const bodyText = await res.text()
    logger.info(`[exchangeQRBDUSS] Status: ${res.status}, body: ${bodyText.substring(0, 600)}`)

    const setCookies = res.headers.getSetCookie()
    logger.info(`[exchangeQRBDUSS] Set-Cookie count: ${setCookies.length}`)

    // Build cookie map from tempCookies and Set-Cookie headers
    const cookieMap = new Map<string, string>()
    const parseCookieStr = (cStr: string) => {
      if (!cStr) return
      cStr.split(';').forEach((c) => {
        const idx = c.indexOf('=')
        if (idx > 0) {
          const key = c.substring(0, idx).trim()
          const val = c.substring(idx + 1).trim()
          if (key) cookieMap.set(key, val)
        }
      })
    }
    parseCookieStr(tempCookies)
    setCookies.forEach((header) => {
      const parts = header.split(';')
      const firstPart = parts[0]
      const idx = firstPart.indexOf('=')
      if (idx > 0) {
        const key = firstPart.substring(0, idx).trim()
        const val = firstPart.substring(idx + 1).trim()
        if (key) cookieMap.set(key, val)
      }
    })

    // Try to parse BDUSS from the response body (JSONP or JSON)
    // The response is typically a JSONP callback or plain JSON containing:
    // {"errInfo":{"no":"0"}, "data":{"bduss":"REAL_BDUSS","ptoken":"...","stoken":"..."}}
    let bodyJson: any = null
    try {
      // Try parsing as JSONP first: callback({...})
      const jsonpMatch = bodyText.match(/\((.+)\)/s)
      if (jsonpMatch) {
        bodyJson = JSON.parse(jsonpMatch[1])
      } else {
        bodyJson = JSON.parse(bodyText)
      }
    } catch {
      // Not JSON/JSONP — might be HTML redirect page
    }

    if (bodyJson?.data?.bduss) {
      logger.info(`[exchangeQRBDUSS] Found BDUSS in response body`)
      cookieMap.set('BDUSS', bodyJson.data.bduss)
      if (bodyJson.data.ptoken) cookieMap.set('PTOKEN', bodyJson.data.ptoken)
      if (bodyJson.data.stoken) cookieMap.set('STOKEN', bodyJson.data.stoken)
    }

    // If we got a redirect (302/303), follow it to collect more cookies
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (location) {
        logger.info(`[exchangeQRBDUSS] Following redirect to: ${location.substring(0, 200)}`)
        const currentCookies = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
        const redirectRes = await fetch(location, {
          headers: {
            'User-Agent': PAN_UA,
            'Cookie': currentCookies,
          },
          redirect: 'manual',
        })
        const redirectCookies = redirectRes.headers.getSetCookie()
        redirectCookies.forEach((header) => {
          const parts = header.split(';')
          const firstPart = parts[0]
          const idx = firstPart.indexOf('=')
          if (idx > 0) {
            const key = firstPart.substring(0, idx).trim()
            const val = firstPart.substring(idx + 1).trim()
            if (key) cookieMap.set(key, val)
          }
        })
      }
    }

    const finalCookies = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

    if (!finalCookies.includes('BDUSS=')) {
      throw new Error('未获取到有效的 BDUSS，登录可能失败。')
    }

    logger.info(`[exchangeQRBDUSS] Final cookies length: ${finalCookies.length}, has BDUSS: ${finalCookies.includes('BDUSS=')}`)
    return finalCookies
  }
}
