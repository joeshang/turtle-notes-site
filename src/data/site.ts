export const brand = {
  name: '龙龟',
  chineseName: '龙龟',
  slogan: '龙龟载文，落笔成章',
  description: '龙龟载文，落笔成章。用龙龟笔记积累与连接想法，用龙龟编辑器专注独立 Markdown 文稿的写作。原生 Markdown 正文编辑与渲染，让文字各得其所。',
  supportEmail: 'shangchuanren@gmail.com',
  operatorType: '个人开发者',
  operatorName: null as string | null,
  distributionRegion: '中国大陆',
  policyUpdated: '2026 年 10 月 26 日',
};

export type PublicRelease = {
  version: string;
  minimumMacOS: string;
  architecture: 'Apple Silicon' | 'Intel' | 'Universal';
  downloadURL: string;
  checksumURL: string;
};
export type Product = {
  id: 'notes' | 'editor';
  name: string;
  chineseName: string;
  slogan: string;
  description: string;
  icon: string;
  minimumMacOS: string;
  release: PublicRelease | null;
};

// Each product has an independent release. Populate only after a real public
// artifact has passed signing, upload, checksum and installation verification.
import releaseData from './releases.json';

export const products: Product[] = [
  {
    id: 'notes', name: 'Turtle Notes', chineseName: '龙龟笔记',
    slogan: '龙龟载思，灵感相连',
    description: '收藏零散灵感，用标签整理，让想法通过双向链接彼此连接。',
    icon: '/images/app-icon.png', minimumMacOS: '14.0', release: releaseData.notes as PublicRelease | null,
  },
  {
    id: 'editor', name: 'Turtle Markdown Editor', chineseName: '龙龟编辑器',
    slogan: '龙龟载文，落笔成章',
    description: '打开一份 Markdown，专注把思路写成文章，保存或导出，自由带走。',
    icon: '/images/editor-icon.png', minimumMacOS: '14.0', release: releaseData.editor as PublicRelease | null,
  },
];

// Add only verified official distribution URLs when iOS distribution is available.
export const notesIOS = {
  minimumIOS: '18.0',
  appStoreURL: null as string | null,
  testFlightURL: null as string | null,
};
export const iosDownloadLinks = [
  { label: '在 App Store 获取', url: notesIOS.appStoreURL },
  { label: '通过 TestFlight 体验', url: notesIOS.testFlightURL },
].filter((link): link is { label: string; url: string } => link.url !== null);

export const faqs = [
  {
    question: '为什么叫「龙龟」？',
    answer: '我的孩子特别喜欢小乌龟，所以起名时，我也想让这个写作工具和小乌龟有一点联系。后来想到龙龟又叫赑屃，有驮碑载文的寓意，于是就用了「龙龟」这个名字，也有了「龙龟载文，落笔成章」这句话。',
  },
  {
    question: '它是原生 Markdown 应用吗？',
    answer: '是。macOS 使用 AppKit，iOS 使用 UIKit，Markdown 正文采用原生文本渲染与编辑，并使用系统窗口、菜单和文本交互，不使用 Electron 承载整个应用。公式与图表由相应的专用渲染组件处理。',
  },
  {
    question: '龙龟笔记和龙龟编辑器，该选哪一个？',
    answer: '如果你想长期积累笔记、使用标签和双向链接，选择龙龟笔记；如果你希望直接打开并编辑独立 Markdown 文件，选择龙龟编辑器。两款 App 可以独立使用，也可以同时安装。',
  },
  {
    question: '内容存在哪里？可以离线使用吗？',
    answer: '两款 App 均可离线编辑。龙龟笔记将笔记与附件保存在本地笔记库，具备云端权限的龙龟笔记版本可选择开启 iCloud 同步；龙龟编辑器将文稿保存到你选择的文件位置，不使用 Notes 笔记库或内置 CloudKit 同步。',
  },
  {
    question: '支持哪些 Markdown 内容与导出格式？',
    answer: '两款 App 共用 Markdown 编辑能力，支持标题、任务清单、表格、公式和 Mermaid，可切换渲染与源码视图，并支持 Markdown 及引用的本地附件、PDF 导出。',
  },
  {
    question: '支持哪些设备？现在可以下载吗？',
    answer: '龙龟笔记支持 Mac、iPhone 与 iPad，龙龟编辑器面向 Mac。当前 Mac 版本要求 macOS 14.0 或更新版本，iOS 版要求 iOS 18.0 或更新版本。公开下载仍在准备中；笔记下载页分别提供 macOS 与 iOS 入口，正式开放后会列明对应的安装包或 App Store / TestFlight 地址。',
  },
  {
    question: '需要注册龙龟账号吗？',
    answer: '当前两款 App 没有龙龟账号系统。使用本地编辑功能不需要注册；可用版本中的 iCloud 同步使用设备上已登录的 Apple 账户。',
  },
];
