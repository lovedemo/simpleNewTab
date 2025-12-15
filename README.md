# Simple New Tab

一个简洁美观的 Chrome 新标签页扩展。

## ✨ 功能特点

- 🕐 **实时时钟** - 显示当前时间、日期和问候语
- 🔍 **多搜索引擎** - 支持 Google、百度、Bing 快速切换
- 🔗 **快捷链接** - 自定义常用网站快捷方式
- 🖼️ **动态壁纸** - Picsum 随机壁纸 / Bing 每日壁纸
- 🎨 **精美设计** - 深色主题 + 玻璃拟态风格
- ☁️ **云端同步** - 快捷方式通过 Google 账户同步

## 📦 安装

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 开启「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择 `simpleNewTab` 文件夹

## 🎯 使用方法

### 搜索

- 输入内容按 Enter 搜索
- 直接输入网址可快速访问
- 点击 G/B/Bi 按钮切换搜索引擎

### 快捷方式

- 点击「+」按钮添加快捷方式
- 右键点击可编辑或删除

### 壁纸设置

点击右下角 🖼️ 按钮：

- **Picsum** - 高质量随机壁纸
- **Bing 每日** - 微软必应每日精选
- **纯色** - 使用默认渐变背景

更换频率：手动 / 每小时 / 每 6 小时 / 每 12 小时 / 每 24 小时 / 每周

## 📁 项目结构

```
simpleNewTab/
├── manifest.json           # 扩展配置
├── newtab.html             # 主页面
├── css/
│   └── style.css           # 样式
├── js/
│   ├── main.js             # 主入口
│   ├── config.js           # 配置常量
│   ├── storage.js          # 存储模块
│   ├── time.js             # 时间模块
│   ├── search.js           # 搜索模块
│   ├── shortcuts.js        # 快捷方式模块
│   └── wallpaper.js        # 壁纸模块
├── icons/
│   └── generate-icons.html # 图标生成器
└── README.md
```

## 🛠️ 技术栈

- HTML5 / CSS3 / ES Modules
- Chrome Extensions API (Manifest V3)
- [Picsum Photos](https://picsum.photos/) - 免费壁纸 API

## 📝 更新日志

### v2.1.0

- 修复：改用 Picsum Photos API（Unsplash Source 已停用）
- 简化：移除分类选择（Picsum 不支持）

### v2.0.0

- 重构：模块化代码架构
- 移除：本地图片上传功能

### v1.0.0

- 初始版本

## 📄 License

MIT
