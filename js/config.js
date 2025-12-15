/**
 * 配置常量
 */

// 搜索引擎配置
export const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  bing: 'https://www.bing.com/search?q='
};

// 默认快捷方式
export const DEFAULT_SHORTCUTS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: '知乎', url: 'https://www.zhihu.com' },
  { name: '微博', url: 'https://weibo.com' },
  { name: '哔哩哔哩', url: 'https://www.bilibili.com' }
];

// Picsum Photos 配置
// 文档: https://picsum.photos/
export const PICSUM_CONFIG = {
  baseUrl: 'https://picsum.photos',
  width: 1920,
  height: 1080
};

// Bing 每日壁纸 API（不包含 idx 参数，由代码动态添加）
export const BING_API_BASE = 'https://www.bing.com/HPImageArchive.aspx?format=js&n=1&mkt=zh-CN';

// 刷新间隔选项 (毫秒)
export const REFRESH_INTERVALS = {
  0: '手动更换',
  3600000: '每小时',
  21600000: '每6小时',
  43200000: '每12小时',
  86400000: '每24小时',
  604800000: '每周'
};

