import { Context } from '@koishijs/client'
import LoginConsole from './LoginConsole.vue'

export default (ctx: Context) => {
  ctx.page({
    name: '百度网盘转存',
    path: '/miyako-baidu-netdisk',
    component: LoginConsole,
    authority: 1,
  })
}

