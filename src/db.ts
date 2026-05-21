import { Context } from 'koishi'

declare module 'koishi' {
  interface Tables {
    chatluna_baidu_account: BaiduAccount
    chatluna_baidu_user_binding: BaiduUserBinding
  }
}

export interface BaiduAccount {
  id: number
  uid: string
  username: string
  avatar: string
  cookies: string
  isActive: boolean
  cookieValid: boolean
  quotaTotal: number
  quotaUsed: number
  updatedAt: Date
}

export interface BaiduUserBinding {
  id: number
  platform: string
  userId: string
  accountId: number
  createdAt: Date
  updatedAt: Date
}

export function registerDatabase(ctx: Context) {
  ctx.model.extend('chatluna_baidu_account', {
    id: 'unsigned',
    uid: 'string',
    username: 'string',
    avatar: 'string',
    cookies: 'text',
    isActive: 'boolean',
    cookieValid: { type: 'boolean', initial: true },
    quotaTotal: 'unsigned',
    quotaUsed: 'unsigned',
    updatedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('chatluna_baidu_user_binding', {
    id: 'unsigned',
    platform: 'string',
    userId: 'string',
    accountId: 'unsigned',
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })
}

export async function getAccounts(ctx: Context): Promise<BaiduAccount[]> {
  return await ctx.database.get('chatluna_baidu_account', {})
}

export async function getActiveAccount(ctx: Context): Promise<BaiduAccount | null> {
  const accounts = await ctx.database.get('chatluna_baidu_account', { isActive: true })
  return accounts[0] || null
}

export async function getBoundAccount(ctx: Context, platform: string, userId: string): Promise<BaiduAccount | null> {
  const [binding] = await ctx.database.get('chatluna_baidu_user_binding', { platform, userId })
  if (!binding) return null

  const [account] = await ctx.database.get('chatluna_baidu_account', { id: binding.accountId })
  return account || null
}

export async function bindAccountToUser(
  ctx: Context,
  platform: string,
  userId: string,
  accountId: number
): Promise<BaiduUserBinding> {
  const now = new Date()
  const [existing] = await ctx.database.get('chatluna_baidu_user_binding', { platform, userId })
  if (existing) {
    await ctx.database.set('chatluna_baidu_user_binding', existing.id, {
      accountId,
      updatedAt: now,
    })
    return { ...existing, accountId, updatedAt: now }
  }

  return await ctx.database.create('chatluna_baidu_user_binding', {
    platform,
    userId,
    accountId,
    createdAt: now,
    updatedAt: now,
  })
}

export async function unbindAccountFromUser(ctx: Context, platform: string, userId: string): Promise<void> {
  await ctx.database.remove('chatluna_baidu_user_binding', { platform, userId })
}

export async function saveAccount(
  ctx: Context,
  account: Omit<BaiduAccount, 'id' | 'isActive' | 'updatedAt' | 'cookieValid'> & { cookieValid?: boolean }
): Promise<BaiduAccount> {
  const existing = await ctx.database.get('chatluna_baidu_account', { uid: account.uid })
  const now = new Date()
  const cookieValid = account.cookieValid ?? true

  if (existing.length > 0) {
    await ctx.database.set('chatluna_baidu_account', existing[0].id, {
      ...account,
      cookieValid,
      updatedAt: now,
    })
    return { ...existing[0], ...account, cookieValid, updatedAt: now }
  } else {
    // If this is the first account, make it active
    const count = (await ctx.database.get('chatluna_baidu_account', {})).length
    const isActive = count === 0

    const newAccount = await ctx.database.create('chatluna_baidu_account', {
      ...account,
      cookieValid,
      isActive,
      updatedAt: now,
    })
    return newAccount
  }
}

export async function deleteAccount(ctx: Context, id: number): Promise<void> {
  const [account] = await ctx.database.get('chatluna_baidu_account', { id })
  if (!account) return

  await ctx.database.remove('chatluna_baidu_account', { id })

  // If the deleted account was active, activate another one if available
  if (account.isActive) {
    const remaining = await ctx.database.get('chatluna_baidu_account', {})
    if (remaining.length > 0) {
      await ctx.database.set('chatluna_baidu_account', remaining[0].id, { isActive: true })
    }
  }
}

export async function setActiveAccount(ctx: Context, id: number): Promise<void> {
  await ctx.database.set('chatluna_baidu_account', {}, { isActive: false })
  await ctx.database.set('chatluna_baidu_account', id, { isActive: true })
}

export async function updateQuota(
  ctx: Context,
  id: number,
  quotaTotal: number,
  quotaUsed: number
): Promise<void> {
  await ctx.database.set('chatluna_baidu_account', id, {
    quotaTotal,
    quotaUsed,
    updatedAt: new Date(),
  })
}
