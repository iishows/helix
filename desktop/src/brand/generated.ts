// 由 tools/brand/apply.mjs 生成 —— 请勿手改。
// 品牌: helix / Helix
// 改品牌请编辑 brands/helix/brand.json 后重新运行构建。

export type BrandSocialLink = {
  name: string
  url: string
  label: string
  icon: string | null
}

export type BrandAttribution = {
  text: string
  url: string
  copyright: string
}

export type Brand = {
  id: string
  productName: string
  windowTitle: string
  appId: string
  tagline: string
  accent: string | null
  /** 侧边栏字标的两段式写法(第二段着品牌色),如 ["cc-","haha"];null 则整名显示 */
  wordmarkSplit: [string, string] | null
  /** 仓库链接(取 repo.url,缺省回退到上游署名地址) */
  repoUrl: string
  logo: { mark: string | null; wordmark: string | null }
  author: {
    name: string
    github: string | null
    avatar: string | null
    social: BrandSocialLink[]
  }
  repo: {
    url: string | null
    issues: string | null
    releases: string | null
    label: string | null
  }
  communityQr: string | null
  attribution: BrandAttribution
}

export const BRAND: Brand = {
  "id": "helix",
  "productName": "Helix",
  "windowTitle": "Helix",
  "appId": "com.helix.desktop",
  "tagline": "Helix Desktop",
  "accent": null,
  "wordmarkSplit": null,
  "repoUrl": "https://github.com/iishows/helix",
  "logo": {
    "mark": "brand/mark.svg",
    "wordmark": "brand/wordmark.svg"
  },
  "author": {
    "name": "doitx.ai",
    "github": "https://github.com/iishows",
    "avatar": null,
    "social": [
      {
        "name": "GitHub",
        "url": "https://github.com/iishows",
        "label": "doitx.ai",
        "icon": "icons/github.svg"
      },
      {
        "name": "Bilibili",
        "url": "https://space.bilibili.com/3461579641194985",
        "label": "doitx.ai",
        "icon": "icons/bilibili.svg"
      },
      {
        "name": "Douyin",
        "url": "https://www.douyin.com/user/MS4wLjABAAAAg-ERYsj2ql8FRzp1YnpFM1oDKOVLI8CEFqKFC7jseIQ",
        "label": "doitx.ai",
        "icon": "icons/douyin.svg"
      },
      {
        "name": "Xiaohongshu",
        "url": "https://www.xiaohongshu.com/user/profile/62da33260000000002002ff3",
        "label": "doitx.ai",
        "icon": "icons/xiaohongshu.svg"
      }
    ]
  },
  "repo": {
    "url": "https://github.com/iishows/helix",
    "issues": "https://github.com/iishows/helix/issues",
    "releases": "https://github.com/iishows/helix/releases",
    "label": "iishows/helix"
  },
  "communityQr": null,
  "attribution": {
    "text": "Based on cc-haha",
    "url": "https://github.com/NanmiCoder/cc-haha",
    "copyright": "Copyright (c) 2026 cc-haha"
  }
}
