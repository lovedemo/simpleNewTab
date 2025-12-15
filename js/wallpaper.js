/**
 * 壁纸模块 - 使用 Picsum Photos API
 * 文档: https://picsum.photos/
 */

import { PICSUM_CONFIG, BING_API_BASE } from './config.js';
import { getSync, setSync } from './storage.js';

// DOM 元素
let wallpaperLayer;
let wallpaperInfo;
let settingsBtn;
let modalOverlay;
let sourceTabs;
let intervalSelect;
let previewEl;
let refreshBtn;
let closeBtn;

// 壁纸状态
let settings = {
  source: 'picsum',      // picsum | bing | none
  interval: 86400000,    // 24小时
  currentWallpaper: null,
  lastRefresh: null
};

// 标记是否是首次加载（用于判断是否应该使用同步的壁纸）
let isFirstLoad = true;

/**
 * 初始化壁纸模块
 */
export async function init () {
  // 获取 DOM 元素
  wallpaperLayer = document.getElementById('wallpaperLayer');
  wallpaperInfo = document.getElementById('wallpaperInfo');
  settingsBtn = document.getElementById('settingsBtn');
  modalOverlay = document.getElementById('wallpaperModal');
  sourceTabs = document.querySelectorAll('.source-tab');
  intervalSelect = document.getElementById('intervalSelect');
  previewEl = document.getElementById('wallpaperPreview');
  refreshBtn = document.getElementById('refreshBtn');
  closeBtn = document.getElementById('closeWallpaperBtn');

  // 加载设置
  await loadSettings();

  // 绑定事件
  bindEvents();

  // 监听存储变化（当 background 更新壁纸时同步）
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.wallpaperSettings) {
      const newSettings = changes.wallpaperSettings.newValue;
      if (newSettings && newSettings.currentWallpaper) {
        // 检查壁纸是否有变化
        if (newSettings.currentWallpaper.url !== settings.currentWallpaper?.url) {
          console.log('[Wallpaper] 检测到后台更新，刷新壁纸');
          settings = { ...settings, ...newSettings };
          applyWallpaper(settings.currentWallpaper);
        }
      }
    }
  });

  // 加载壁纸
  await loadWallpaper();
}

/**
 * 绑定事件
 */
function bindEvents () {
  // 打开设置
  settingsBtn.addEventListener('click', openModal);

  // 关闭设置
  closeBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // 来源切换
  sourceTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const source = tab.dataset.source;
      settings.source = source;

      sourceTabs.forEach(t => t.classList.toggle('active', t === tab));

      saveSettings();
      // 通知 background 更新定时器
      try {
        await chrome.runtime.sendMessage({ type: 'UPDATE_ALARM' });
      } catch (e) {
        // ignore
      }
      loadWallpaper(true);
    });
  });

  // 刷新间隔
  intervalSelect.addEventListener('change', async () => {
    settings.interval = parseInt(intervalSelect.value);
    saveSettings();
    // 通知 background 更新定时器
    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_ALARM' });
      console.log('[Wallpaper] 定时器已更新');
    } catch (e) {
      console.log('[Wallpaper] 通知 background 失败:', e);
    }
  });

  // 手动刷新
  refreshBtn.addEventListener('click', () => {
    if (!refreshBtn.disabled) {
      loadWallpaper(true);
    }
  });
}

/**
 * 加载设置
 */
async function loadSettings () {
  const { wallpaperSettings } = await getSync(['wallpaperSettings']);
  if (wallpaperSettings) {
    // 兼容旧设置：把 unsplash 迁移到 picsum
    if (wallpaperSettings.source === 'unsplash') {
      wallpaperSettings.source = 'picsum';
    }
    settings = { ...settings, ...wallpaperSettings };
  }
  updateUI();
}

/**
 * 保存设置
 */
function saveSettings () {
  setSync({ wallpaperSettings: settings });
}

/**
 * 更新 UI
 */
function updateUI () {
  // 更新来源选项卡
  sourceTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === settings.source);
  });

  // 更新下拉框
  intervalSelect.value = settings.interval;
}

/**
 * 设置 loading 状态
 */
function setLoading (loading) {
  if (loading) {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
  } else {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('loading');
  }
}

/**
 * 加载壁纸
 */
async function loadWallpaper (forceRefresh = false) {
  const now = Date.now();

  // 首次加载时，如果已有同步的壁纸，直接使用（不受时间判断影响）
  // 这样可以确保从其他设备同步过来的壁纸能正确显示
  if (isFirstLoad && settings.currentWallpaper && !forceRefresh) {
    console.log('[Wallpaper] 首次加载，使用同步的壁纸');
    isFirstLoad = false;
    applyWallpaper(settings.currentWallpaper);
    return;
  }
  isFirstLoad = false;

  const shouldRefresh = forceRefresh ||
    !settings.currentWallpaper ||
    (settings.interval > 0 &&
      settings.lastRefresh &&
      now - settings.lastRefresh >= settings.interval);

  if (!shouldRefresh && settings.currentWallpaper) {
    applyWallpaper(settings.currentWallpaper);
    return;
  }

  // 显示 loading 状态
  setLoading(true);

  let wallpaper = null;

  try {
    switch (settings.source) {
      case 'picsum':
        wallpaper = await fetchPicsum();
        break;
      case 'bing':
        wallpaper = await fetchBing();
        break;
      case 'none':
        clearWallpaper();
        setLoading(false);
        return;
    }

    if (wallpaper) {
      settings.currentWallpaper = wallpaper;
      settings.lastRefresh = now;
      saveSettings();
      applyWallpaper(wallpaper);
    } else {
      setLoading(false);
    }
  } catch (error) {
    console.error('[Wallpaper] 加载失败:', error);
    setLoading(false);
  }
}

/**
 * 从 Picsum Photos 获取壁纸
 * 文档: https://picsum.photos/
 * 
 * URL 格式: https://picsum.photos/1920/1080?random=timestamp
 * 会自动 302 重定向到 fastly.picsum.photos 的真实图片
 */
async function fetchPicsum () {
  const { width, height } = PICSUM_CONFIG;

  // 添加随机参数确保每次获取不同图片
  const randomSeed = Date.now();
  const sourceUrl = `https://picsum.photos/${width}/${height}?random=${randomSeed}`;

  console.log('[Wallpaper] Picsum Photos URL:', sourceUrl);

  try {
    // 发起请求获取重定向后的真实 URL
    const response = await fetch(sourceUrl);
    // response.url 是重定向后的最终 URL
    const finalUrl = response.url;

    console.log('[Wallpaper] 重定向到:', finalUrl);

    return {
      url: finalUrl,
      source: 'picsum',
      author: 'Picsum Photos',
      link: 'https://picsum.photos'
    };
  } catch (error) {
    console.error('[Wallpaper] Picsum 请求失败:', error);
    // 降级：直接使用带随机参数的 URL
    return {
      url: sourceUrl,
      source: 'picsum',
      author: 'Picsum Photos',
      link: 'https://picsum.photos'
    };
  }
}

/**
 * 从 Bing 获取每日壁纸
 * idx 参数: 0=今天, 1=昨天, ..., 7=7天前（最多8张历史图片）
 */
async function fetchBing () {
  try {
    // 随机选择最近 8 天的图片（idx: 0-7）
    const idx = Math.floor(Math.random() * 8);
    const apiUrl = `${BING_API_BASE}&idx=${idx}`;

    console.log('[Wallpaper] Bing API URL:', apiUrl);

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.images && data.images[0]) {
      const image = data.images[0];
      return {
        url: `https://www.bing.com${image.url}`,
        source: 'bing',
        author: image.copyright || 'Bing',
        link: image.copyrightlink || 'https://www.bing.com'
      };
    }
  } catch (error) {
    console.error('获取 Bing 壁纸失败:', error);
    // 降级到 Picsum
    return fetchPicsum();
  }
}

/**
 * 应用壁纸
 */
function applyWallpaper (wallpaper) {
  if (!wallpaper || !wallpaper.url) {
    console.log('[Wallpaper] 无效的壁纸数据');
    clearWallpaper();
    setLoading(false);
    return;
  }

  console.log('[Wallpaper] 正在加载壁纸:', wallpaper.url);

  // 预加载图片
  const img = new Image();
  img.crossOrigin = 'anonymous'; // 允许跨域加载

  img.onload = () => {
    console.log('[Wallpaper] 壁纸加载成功');
    wallpaperLayer.style.backgroundImage = `url(${wallpaper.url})`;
    wallpaperLayer.classList.add('loaded');
    updateInfo(wallpaper);
    updatePreview(wallpaper.url);
    // 图片加载完成后移除 loading 状态
    setLoading(false);
  };

  img.onerror = (e) => {
    console.error('[Wallpaper] 壁纸加载失败:', e);
    // 尝试直接设置背景（跳过预加载）
    wallpaperLayer.style.backgroundImage = `url(${wallpaper.url})`;
    wallpaperLayer.classList.add('loaded');
    updateInfo(wallpaper);
    updatePreview(wallpaper.url);
    // 加载失败也移除 loading 状态
    setLoading(false);
  };

  img.src = wallpaper.url;
}

/**
 * 清除壁纸
 */
function clearWallpaper () {
  wallpaperLayer.style.backgroundImage = '';
  wallpaperLayer.classList.remove('loaded');
  wallpaperInfo.classList.remove('visible');
  settings.currentWallpaper = null;
  saveSettings();
  updatePreview(null);
}

/**
 * 更新壁纸信息
 */
function updateInfo (wallpaper) {
  if (!wallpaper || wallpaper.source === 'none') {
    wallpaperInfo.classList.remove('visible');
    return;
  }

  let html = '📷 ';

  if (wallpaper.source === 'picsum') {
    html += `Photo on <a href="https://picsum.photos" target="_blank">Picsum Photos</a>`;
  } else if (wallpaper.source === 'bing') {
    html += `<a href="${wallpaper.link}" target="_blank">${wallpaper.author}</a>`;
  }

  wallpaperInfo.innerHTML = html;
  wallpaperInfo.classList.add('visible');
}

/**
 * 更新预览
 */
function updatePreview (url) {
  if (url) {
    previewEl.innerHTML = `<img src="${url}" alt="当前壁纸">`;
  } else {
    previewEl.innerHTML = `<span class="no-wallpaper">暂无壁纸</span>`;
  }
}

/**
 * 打开设置弹窗
 */
function openModal () {
  modalOverlay.classList.add('active');
  updateUI();
}

/**
 * 关闭设置弹窗
 */
export function closeModal () {
  modalOverlay.classList.remove('active');
}
