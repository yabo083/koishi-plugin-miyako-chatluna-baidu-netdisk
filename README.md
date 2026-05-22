# koishi-plugin-miyako-chatluna-baidu-netdisk

Miyako ChatLuna 百度网盘工具插件。它为 ChatLuna 暴露封装后的网盘文件管理、分享转存、分享创建与下载代理工具，同时将账号凭证、Cookie、下载端点与并发下载逻辑保留在插件服务端内部。

## Features

- Koishi 控制台扫码登录与多账号管理
- ChatLuna 工具：列目录、搜索、建目录、重命名、移动、删除开关保护
- 分享链接转存与已有文件创建分享链接
- 下载代理链接与插件内并发分片下载
- 面向提示词注入的凭证边界：模型只调用工具，不接触内部账号材料

## Development

```bash
npm install
npm run build
npm test
```

## Acknowledgements

Special thanks to:

<p align="center">
  <a href="https://github.com/lumia1998" title="lumia1998">
    <img src="./docs/assets/acknowledgements/lumia1998.svg" width="64" height="64" alt="lumia1998" />
  </a>
  <a href="https://github.com/Procyon-Nan" title="Procyon-Nan">
    <img src="./docs/assets/acknowledgements/Procyon-Nan.svg" width="64" height="64" alt="Procyon-Nan" />
  </a>
  <a href="https://github.com/BlakSatori" title="BlakSatori">
    <img src="./docs/assets/acknowledgements/BlakSatori.svg" width="64" height="64" alt="BlakSatori" />
  </a>
</p>

## Publishing

GitHub Actions uses npm trusted publishing/OIDC on `v*` tags. The first npm package and trusted publisher settings should be created in npm by the maintainer before relying on the workflow for automated publish.
