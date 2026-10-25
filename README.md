# Turtle · 龙龟官网

**龙龟载文，落笔成章。**

龙龟笔记与龙龟编辑器的独立 Astro 静态站点。官网源码在本仓库根目录维护；App 源码、签名、公证和内部构建记录独立管理。

目标地址：<https://joeshang.github.io/turtle-notes-site/>。

## 本地开发与检查

需要 Node.js 24 LTS 和 npm。

```sh
npm ci
npm run dev
# http://127.0.0.1:4321/turtle-notes-site/
npm test
npm run verify
npm run preview
```

本地也使用 `/turtle-notes-site/` 前缀，便于验证 Pages 的真实路径。`verify` 检查类型、静态构建、6 个页面、站内锚点、图片、脚本、CSS 资源与日夜截图，拒绝越出前缀的路径和不应进入 Pages 的安装包或内部文件。

## 外观与内容

- 默认跟随系统日夜外观；右上角按钮可切换并在浏览器本地记住选择。没有访客追踪或外部字体。
- 两款 App 分别展示真实日间 / 夜间界面；可独立切换截图，默认跟随网站外观。图片中的内容为虚构示例。
- 页面：主页、`downloads/notes/`、`downloads/editor/`、`support/`、`privacy/`、`404.html`。
- 联系邮箱和产品文案：`src/data/site.ts`；发行下载信息：`src/data/releases.json`。
- 隐私政策仍为预览稿。个人开发者真实署名、生效日期、服务处理关系与跨境安排需在正式发行前落实；代码和托管配置变更也需同步复核政策。

## GitHub Pages

1. 仓库保持 public。在 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**。
2. `github-pages` environment 的部署规则允许 `main` 分支，以及用于正式发布的 `v*` 标签（release 事件的 ref 为标签）。不要为此放宽仓库其他权限。
3. 合并至 `main` 后，工作流先测试、加载经过校验的公开下载信息并构建，再通过官方 Pages Actions 上传、部署 `dist/`。也可在 `main` 上手动运行。
4. PR 只测试与构建，不上传 Pages artifact、不触发部署。发布正式 Release 时重新构建官网，始终检出当前 `main` 的官网源码。

工作流使用 `contents: read`；仅部署 job 使用 `pages: write` 和 `id-token: write`。Pages artifact 不包含 DMG、源码仓库凭据或构建日志。

## 正式 Release 与官网更新

公开 Release 接收**同一次正式构建**的两份 DMG、两份 `.sha256`，以及 `turtle-downloads.json`。不要将 DMG 放到 Git 历史、`public/` 或 Pages artifact。

正式发布脚本应在所有本地签名、公证、票据与安装包验证完成后：

1. 在内部归档仓库保留原 Release；在本仓库以相同版本创建草稿，public tag 指向本仓库官网 commit。
2. 上传上述五个公开文件。下载元数据仅含产品、版本、最低系统、架构、文件名、大小和 SHA-256，不含 App 源码 commit、团队签名信息或内部构建路径。
3. 校验附件集合、大小与 SHA-256 后发布；完整元数据的 SHA-256 同时记录在 Release 正文的 `turtle-public-release` 标记中。不要覆盖正式版本。

`npm run sync-release` 在**构建时**读取本仓库公开的稳定 Release：

- 忽略草稿和预发布；按数字版本选择最新版本。
- 校验仓库、tag、版本、产品、架构、系统要求、附件集合、元数据标记、DMG 大小与摘要、校验文件内容。GitHub 没有返回 DMG digest 时，流式下载计算 SHA-256。
- 两个产品全部通过后才原子替换下载配置。缺文件、损坏、网络或权限错误会让构建失败，已有 Pages 部署不受影响。
- 没有正式 Release 时保留现有配置；初始配置为空，下载页显示“准备中”。不会虚构安装包链接。

公开 DMG 下载使用 `https://github.com/joeshang/turtle-notes-site/releases/download/<tag>/<filename>`，不要求访问者登录。运行时没有向 GitHub API 查询版本的客户端请求。

如需本地核对：

```sh
npm run sync-release
npm run verify
```

一次上传中途失败，应在原构建环境使用保存的产物续传同版本；不得重新构建、重签或覆盖已经公开的版本。先修复失败的 Release，再重跑 Pages 工作流即可。大陆备用镜像另行验证，不属于当前主下载源。

参考：[Astro GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)、[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
