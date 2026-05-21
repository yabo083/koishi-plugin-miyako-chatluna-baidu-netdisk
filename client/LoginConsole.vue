<template>
  <k-layout>
    <div class="miyako-netdisk-page">
    <!-- Header/Toolbar -->
    <div class="toolbar-container">
      <div class="toolbar-main">
        <div class="headline">
          <div class="page-title">Miyako 百度网盘</div>
          <div class="page-subtitle">纯 Node.js 原生网盘管理与 ChatLuna 自动转存工具</div>
        </div>
        <div class="actions-section">
          <el-button size="small" type="primary" :icon="Refresh" @click="fetchAccounts" :loading="loading">
            同步刷新
          </el-button>
        </div>
      </div>
    </div>

    <!-- Main Content Tab Layout -->
    <div class="page-content" v-loading="loading">
      <div class="tabs">
        <div :class="['tab', { active: activeTab === 'accounts' }]" @click="activeTab = 'accounts'">
          账号管理
        </div>
        <div :class="['tab', { active: activeTab === 'tools' }]" @click="activeTab = 'tools'">
          工具文档
        </div>
      </div>

      <!-- Tab 1: Account Management -->
      <div class="tab-content" v-if="activeTab === 'accounts'">
        <el-row :gutter="24">
          <!-- Left Panel: Account List -->
          <el-col :xs="24" :md="14">
            <el-card class="glass-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <span class="card-header-title">已绑定账号列表</span>
                </div>
              </template>

              <el-table :data="accounts" style="width: 100%" v-if="accounts.length > 0">
                <el-table-column label="用户信息" min-width="180">
                  <template #default="{ row }">
                    <div class="table-user">
                      <el-avatar :size="40" :src="row.avatar || 'https://himg.bdimg.com/sys/portrait/item/default'" />
                      <div class="user-meta">
                        <div class="tbl-username">{{ row.username }}</div>
                        <div class="tbl-uid">UID: {{ row.uid }}</div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column label="容量使用情况" min-width="180">
                  <template #default="{ row }">
                    <div class="table-quota" v-if="row.quotaTotal > 0">
                      <div class="quota-mini-text">
                        {{ formatBytes(row.quotaUsed) }} / {{ formatBytes(row.quotaTotal) }}
                      </div>
                      <el-progress 
                        :percentage="Math.min(100, Math.round((row.quotaUsed / row.quotaTotal) * 100))" 
                        :stroke-width="6" 
                        :show-text="false"
                        status="primary"
                      />
                    </div>
                    <span v-else class="text-muted">未获取</span>
                  </template>
                </el-table-column>

                <el-table-column label="状态" width="140">
                  <template #default="{ row }">
                    <div class="status-cell">
                      <span :class="['status-chip', row.cookieValid === false ? 'expired' : 'alive']">
                        {{ row.cookieValid === false ? '失效' : '活跃' }}
                      </span>
                      <span v-if="row.isActive" class="status-operating" title="当前操作账号">·</span>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column label="操作" width="220" fixed="right">
                  <template #default="{ row }">
                    <div class="actions-cell">
                      <el-button
                        v-if="!row.isActive"
                        size="small"
                        class="miyako-btn miyako-btn-activate"
                        :icon="Check"
                        link
                        @click="toggleActive(row.id)"
                      >
                        激活
                      </el-button>
                      <el-button
                        size="small"
                        class="miyako-btn miyako-btn-refresh"
                        :icon="Refresh"
                        :loading="actionLoadingId === row.id"
                        link
                        @click="refreshAccount(row.id)"
                      >
                        刷新
                      </el-button>
                      <el-button
                        size="small"
                        class="miyako-btn miyako-btn-delete"
                        :icon="Delete"
                        link
                        @click="deleteAcc(row.id)"
                      >
                        删除
                      </el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>

              <div class="empty-state" v-else>
                <el-empty description="暂无绑定的百度网盘账号" />
              </div>
            </el-card>
          </el-col>

          <!-- Right Panel: Add Account -->
          <el-col :xs="24" :md="10">
            <el-card class="glass-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <span class="card-header-title">添加账号</span>
                </div>
              </template>

              <!-- Inner tabs for login methods -->
              <el-tabs v-model="loginMethod" class="login-tabs">
                <el-tab-pane label="扫码登录 (推荐)" name="qrcode">
                  <div class="qrcode-login-container">
                    <div class="qrcode-wrapper" v-loading="qrStatus === 'get_qr'">
                      <div v-if="qrStatus === 'idle'" class="qr-placeholder">
                        <div class="qr-icon-placeholder">🔲</div>
                        <el-button type="primary" @click="getQRCode">获取登录二维码</el-button>
                      </div>

                      <div v-else-if="qrStatus === 'waiting' || qrStatus === 'scanned'" class="qr-image-wrapper">
                        <img :src="qrImgUrl" class="qr-image" alt="QR Code" />
                        
                        <div v-if="qrStatus === 'scanned'" class="qr-overlay scanned">
                          <div class="overlay-content">
                            <span class="overlay-icon">✓</span>
                            <span>已扫码，请在手机上点击确认登录</span>
                          </div>
                        </div>
                      </div>

                      <div v-else-if="qrStatus === 'expired'" class="qr-placeholder expired">
                        <div class="qr-overlay-text">二维码已失效</div>
                        <el-button type="primary" @click="getQRCode">重新获取</el-button>
                      </div>

                      <div v-else-if="qrStatus === 'error'" class="qr-placeholder error">
                        <div class="qr-overlay-text">加载二维码失败</div>
                        <p class="error-msg">{{ qrError }}</p>
                        <el-button type="primary" @click="getQRCode">重试</el-button>
                      </div>

                      <div v-else-if="qrStatus === 'success'" class="qr-placeholder success">
                        <div class="success-icon">🎉</div>
                        <div class="qr-overlay-text">扫码成功！账号已添加</div>
                        <el-button type="primary" @click="getQRCode">添加另一个</el-button>
                      </div>
                    </div>

                    <div class="qrcode-hint" v-if="qrStatus === 'waiting' || qrStatus === 'scanned'">
                      <p>请打开 <b>手机百度网盘 App</b> 扫描上方二维码进行登录。</p>
                    </div>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="Cookie 登录" name="cookie">
                  <el-form label-position="top">
                    <el-form-item label="浏览器 Cookie 字符串">
                      <el-input
                        v-model="cookiesInput"
                        type="textarea"
                        :rows="4"
                        placeholder="粘贴包含 BDUSS, STOKEN 等的完整 Cookie 字符串..."
                      />
                    </el-form-item>

                    <el-button
                      type="primary"
                      style="width: 100%; margin-top: 12px;"
                      :loading="submitting"
                      @click="addAccount"
                    >
                      保存并验证账号
                    </el-button>
                  </el-form>

                  <!-- Help box -->
                  <div class="cookie-help">
                    <div class="help-title">💡 如何获取 Cookie？</div>
                    <ol>
                      <li>在电脑端浏览器中打开 <a href="https://pan.baidu.com" target="_blank">百度网盘官网</a> 并登录。</li>
                      <li>按 <b>F12</b> 打开开发者工具，切换到 <b>网络 (Network)</b> 面板。</li>
                      <li>刷新页面，点击任意一个请求（如 <code>main</code> 或 <code>quota</code>）。</li>
                      <li>在右侧的 <b>标头 (Headers)</b> 页签中找到 <b>请求标头 (Request Headers)</b>。</li>
                      <li>复制 <code>Cookie</code> 字段的完整值填入上方。</li>
                    </ol>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- Tab 2: Documentation -->
      <div class="tab-content" v-else-if="activeTab === 'tools'">
        <el-card class="glass-card documentation-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">已向 ChatLuna 注册的工具 (Tools)</span>
            </div>
          </template>

          <div class="tool-list">
            <div class="tool-item">
              <div class="tool-name">baidu_netdisk_file_manager</div>
              <div class="tool-desc">
                网盘文件管理万能工具，支持多种操作。输入 JSON 字符串，通过 <code>action</code> 字段切换功能：
                <ul class="action-list">
                  <li><b>list</b> — 列出目录内容</li>
                  <li><b>search</b> — 关键字搜索文件</li>
                  <li><b>delete</b> — 删除文件/文件夹（支持批量）</li>
                  <li><b>mkdir</b> — 创建文件夹</li>
                  <li><b>rename</b> — 重命名文件/文件夹</li>
                  <li><b>move</b> — 移动文件/文件夹（支持批量）</li>
                </ul>
              </div>
              <div class="tool-example">
                <strong>调用格式:</strong>
                <code>{"action": "list", "path": "/我的文档"}</code>
                <br />
                <code>{"action": "rename", "path": "/旧.txt", "newName": "新.txt"}</code>
                <br />
                <code>{"action": "move", "paths": ["/a.zip"], "destDir": "/归档"}</code>
              </div>
            </div>

            <div class="tool-item">
              <div class="tool-name">baidu_netdisk_transfer_and_download</div>
              <div class="tool-desc">
                网盘转存与下载工具。输入 JSON 字符串，通过 <code>action</code> 字段切换功能：
                <ul class="action-list">
                  <li><b>transfer</b> — 将分享链接转存到当前账号</li>
                  <li><b>download</b> — 获取指定文件的下载直链（需配合 UA 工具下载）</li>
                </ul>
              </div>
              <div class="tool-example">
                <strong>调用格式:</strong>
                <code>{"action": "transfer", "shareUrl": "https://pan.baidu.com/s/1xxx", "password": "xxxx", "savePath": "/chatluna-transfers"}</code>
                <br />
                <code>{"action": "download", "path": "/我的文档/资料.zip"}</code>
              </div>
            </div>
          </div>

          <div class="docs-section">
            <h3 class="docs-section-title">🤖 如何指导 AI 使用这些工具？</h3>
            <p>
              插件向 ChatLuna 平台注册了上述 2 个 LangChain 工具，统一以 JSON 输入承载多种操作（action 字段切换），减少了 LLM 上下文消耗的同时保留了完整能力。
            </p>
            <p>
              我们已经在 <code>docs/baidu_netdisk_skill.md</code> 中保存了详细的 Skill 指导文档，您可以通过 ChatLuna 的 Prompt 注入或直接加载该 Markdown 丰富 Agent 的能力。
            </p>
          </div>
        </el-card>
      </div>
    </div>
  </div>
  </k-layout>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Refresh, Check, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface Account {
  id: number
  uid: string
  username: string
  avatar: string
  isActive: boolean
  cookieValid: boolean
  quotaTotal: number
  quotaUsed: number
  updatedAt: string
}

const accounts = ref<Account[]>([])
const cookiesInput = ref('')
const loading = ref(false)
const submitting = ref(false)
const actionLoadingId = ref<number | null>(null)

const activeTab = ref('accounts')
const loginMethod = ref('qrcode')

// QR Code related states
const qrSign = ref('')
const qrImgUrl = ref('')
const qrStatus = ref<'idle' | 'get_qr' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'>('idle')
const qrError = ref('')
let pollIntervalId: any = null

const activeAccount = computed(() => {
  return accounts.value.find((acc) => acc.isActive) || null
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function fetchAccounts() {
  loading.value = true
  try {
    const res = await fetch('/chatluna-baidu-netdisk/accounts')
    if (res.ok) {
      accounts.value = await res.json()
    }
  } catch (err) {
    console.error('Fetch accounts failed', err)
  } finally {
    loading.value = false
  }
}

async function addAccount() {
  if (!cookiesInput.value.trim()) {
    ElMessage.warning('请输入 Cookie 字符串')
    return
  }
  submitting.value = true
  try {
    const res = await fetch('/chatluna-baidu-netdisk/accounts/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cookies: cookiesInput.value }),
    })
    
    const body = await res.json()
    if (res.ok && body.success) {
      cookiesInput.value = ''
      ElMessage.success(`账户 ${body.account.username} 添加成功！`)
      await fetchAccounts()
    } else {
      ElMessage.error(`添加失败：${body.error || '未知错误'}`)
    }
  } catch (err: any) {
    ElMessage.error(`网络连接失败: ${err.message}`)
  } finally {
    submitting.value = false
  }
}

async function toggleActive(id: number) {
  try {
    const res = await fetch('/chatluna-baidu-netdisk/accounts/toggle-active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    })
    const body = await res.json()
    if (res.ok && body.success) {
      ElMessage.success('成功切换活动网盘账号')
      await fetchAccounts()
    } else {
      ElMessage.error('启用账号失败')
    }
  } catch (err: any) {
    ElMessage.error(`通信失败: ${err.message}`)
  }
}

async function deleteAcc(id: number) {
  try {
    await ElMessageBox.confirm('确认删除此百度网盘账户？删除后 ChatLuna 转存与管理工具将无法使用该账号。', '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  try {
    const res = await fetch('/chatluna-baidu-netdisk/accounts/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    })
    const body = await res.json()
    if (res.ok && body.success) {
      ElMessage.success('已删除账号')
      await fetchAccounts()
    } else {
      ElMessage.error('删除失败')
    }
  } catch (err: any) {
    ElMessage.error(`通信失败: ${err.message}`)
  }
}

async function refreshAccount(id: number) {
  actionLoadingId.value = id
  try {
    const res = await fetch('/chatluna-baidu-netdisk/accounts/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    })
    const body = await res.json()
    if (res.ok && body.success) {
      ElMessage.success('空间容量刷新成功')
      await fetchAccounts()
    } else {
      ElMessage.error(`同步失败: ${body.error || '未知错误'}`)
    }
  } catch (err: any) {
    ElMessage.error(`同步失败: ${err.message}`)
  } finally {
    actionLoadingId.value = null
  }
}

// QR Login Actions
async function getQRCode() {
  clearQRInterval()
  qrStatus.value = 'get_qr'
  qrError.value = ''
  try {
    const res = await fetch('/chatluna-baidu-netdisk/qrcode/get')
    const body = await res.json()
    if (res.ok && body.success) {
      qrSign.value = body.sign
      qrImgUrl.value = body.imgUrl
      qrStatus.value = 'waiting'
      
      // Start polling status
      pollIntervalId = setInterval(pollQRStatus, 2000)
    } else {
      qrStatus.value = 'error'
      qrError.value = body.error || '未获取到登录二维码，请重试。'
    }
  } catch (err: any) {
    qrStatus.value = 'error'
    qrError.value = err.message || '网络错误，请稍后重试'
  }
}

async function pollQRStatus() {
  if (!qrSign.value) return
  try {
    const res = await fetch('/chatluna-baidu-netdisk/qrcode/poll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sign: qrSign.value }),
    })
    const body = await res.json()
    if (res.ok) {
      if (body.status === 'success') {
        qrStatus.value = 'success'
        clearQRInterval()
        ElMessage.success(`扫码登录成功！欢迎回来`)
        await fetchAccounts()
      } else if (body.status === 'scanned') {
        qrStatus.value = 'scanned'
      } else if (body.status === 'expired') {
        qrStatus.value = 'expired'
        clearQRInterval()
      } else if (body.status === 'waiting') {
        // Keep waiting
      }
    } else {
      qrStatus.value = 'expired'
      clearQRInterval()
    }
  } catch (err) {
    // Silent catch, keep polling
  }
}

function clearQRInterval() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

onMounted(() => {
  fetchAccounts()
})

onUnmounted(() => {
  clearQRInterval()
})
</script>

<style scoped>
.miyako-netdisk-page {
  min-height: 100%;
  width: min(100%, 1800px);
  min-width: 0;
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 56px;
  box-sizing: border-box;
  color: var(--k-text-dark);
}

.toolbar-container {
  margin-bottom: 24px;
}

.toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.headline {
  min-width: 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--k-text-dark);
}

.page-subtitle {
  font-size: 13px;
  color: var(--k-text-light);
  margin-top: 4px;
}

.actions-section {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 24px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--k-color-divider), transparent 28%);
  border-radius: 16px;
  background: color-mix(in srgb, var(--k-side-bg), var(--k-page-bg) 48%);
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
}

.tab {
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
  font-weight: 500;
  color: var(--k-text-light);
  border-radius: 12px;
  white-space: nowrap;
  font-size: 14px;
}

.tab:hover {
  background: color-mix(in srgb, var(--k-color-divider), transparent 40%);
  color: var(--k-text-dark);
}

.tab.active {
  background: var(--k-page-bg);
  color: color-mix(in srgb, var(--k-text-dark), var(--k-color-primary) 24%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--k-color-divider), transparent 18%);
}

.tab-content {
  min-height: 400px;
}

/* Card styling */
.glass-card {
  border: 1px solid color-mix(in srgb, var(--k-color-divider), transparent 28%);
  border-radius: 16px;
  background: color-mix(in srgb, var(--k-side-bg), var(--k-page-bg) 48%);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  margin-bottom: 24px;
}

.card-header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--k-text-dark);
}

/* User column styling */
.table-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tbl-username {
  font-weight: 600;
  color: var(--k-text-dark);
}

.tbl-uid {
  font-size: 11px;
  color: var(--k-text-light);
}

/* Quota progress styling */
.quota-mini-text {
  font-size: 11px;
  color: var(--k-text-light);
  margin-bottom: 4px;
}

.text-muted {
  color: var(--k-text-light);
  font-size: 12px;
  font-style: italic;
}

/* Miyako unified button theme — ghost/transparent for dark theme harmony */
.miyako-btn {
  --miyako-primary: #8a7cfc;
  background: transparent !important;
  border: none !important;
  padding: 4px 8px !important;
  height: auto !important;
  border-radius: 6px;
  font-weight: 500;
  color: var(--k-text-light);
  transition: color 0.15s ease, background-color 0.15s ease;
}

.miyako-btn :deep(.el-icon) {
  margin-right: 2px;
}

.miyako-btn:hover,
.miyako-btn:focus {
  background: color-mix(in srgb, var(--miyako-primary), transparent 88%) !important;
}

.miyako-btn-activate:hover,
.miyako-btn-activate:focus,
.miyako-btn-refresh:hover,
.miyako-btn-refresh:focus {
  color: var(--miyako-primary);
}

.miyako-btn-delete:hover,
.miyako-btn-delete:focus {
  background: color-mix(in srgb, #f56c6c, transparent 88%) !important;
  color: #f56c6c;
}

/* Status chip */
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.status-chip.alive {
  background: color-mix(in srgb, #8a7cfc, transparent 86%);
  color: #b5acff;
}

.status-chip.expired {
  background: color-mix(in srgb, #f56c6c, transparent 86%);
  color: #ff8a8a;
}

.status-operating {
  color: #8a7cfc;
  font-weight: 900;
  font-size: 16px;
  line-height: 1;
}

/* Action cell */
.actions-cell {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 40px 0;
}

/* Login Tabs inside card */
.login-tabs {
  margin-top: -8px;
}

:deep(.el-tabs__nav-wrap::after) {
  background-color: color-mix(in srgb, var(--k-color-divider), transparent 50%);
}

/* QR code styling */
.qrcode-login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
}

.qrcode-wrapper {
  position: relative;
  width: 220px;
  height: 220px;
  border: 1px solid color-mix(in srgb, var(--k-color-divider), transparent 18%);
  border-radius: 16px;
  overflow: hidden;
  background: var(--k-page-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
  text-align: center;
}

.qr-icon-placeholder {
  font-size: 48px;
  opacity: 0.3;
}

.qr-image-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.qr-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.qr-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  text-align: center;
}

.qr-overlay.scanned {
  background: rgba(16, 185, 129, 0.9);
  color: #fff;
  font-weight: 500;
  font-size: 13px;
  padding: 20px;
}

.overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.overlay-icon {
  font-size: 28px;
}

.qr-overlay-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--k-text-dark);
}

.expired, .error, .success {
  flex-direction: column;
  padding: 20px;
}

.error-msg {
  font-size: 11px;
  color: var(--k-color-danger, #f56c6c);
  margin-bottom: 12px;
  text-align: center;
  max-width: 180px;
}

.success-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.qrcode-hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--k-text-light);
  text-align: center;
  max-width: 240px;
  line-height: 1.5;
}

/* Cookie help styling */
.cookie-help {
  margin-top: 20px;
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--k-color-divider), transparent 94%);
  border: 1px dashed color-mix(in srgb, var(--k-color-divider), transparent 60%);
}

.help-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--k-text-dark);
}

.cookie-help ol {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--k-text-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.5;
}

.cookie-help a {
  color: var(--k-color-primary);
  text-decoration: none;
}

.cookie-help a:hover {
  text-decoration: underline;
}

/* Tool list for documentation */
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tool-item {
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--k-color-divider), transparent 94%);
  border: 1px solid color-mix(in srgb, var(--k-color-divider), transparent 85%);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tool-item:hover {
  border-color: color-mix(in srgb, var(--k-color-primary), transparent 60%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.02);
}

.tool-name {
  font-family: monospace;
  font-size: 15px;
  font-weight: 600;
  color: var(--k-color-primary);
  margin-bottom: 6px;
}

.tool-desc {
  font-size: 13px;
  color: var(--k-text-dark);
  line-height: 1.5;
  margin-bottom: 8px;
}

.tool-example {
  font-size: 12px;
  color: var(--k-text-light);
}

.action-list {
  margin: 6px 0 6px 18px;
  padding: 0;
  font-size: 12px;
  color: var(--k-text-light);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.action-list li b {
  font-family: monospace;
  color: var(--k-color-primary);
}

.tool-example code {
  font-family: monospace;
  background: color-mix(in srgb, var(--k-color-divider), transparent 90%);
  padding: 2px 6px;
  border-radius: 4px;
}

.docs-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid color-mix(in srgb, var(--k-color-divider), transparent 75%);
}

.docs-section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--k-text-dark);
}

.docs-section p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--k-text-light);
  margin-bottom: 12px;
}

.docs-section code {
  font-family: monospace;
  background: color-mix(in srgb, var(--k-color-divider), transparent 90%);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--k-text-dark);
}

@media (max-width: 768px) {
  .miyako-netdisk-page {
    padding: 12px;
  }
  
  .toolbar-main {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .actions-section {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
