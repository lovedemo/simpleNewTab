/**
 * Background Service Worker
 * 使用 Chrome Alarms API 实现定时更新壁纸
 */

import { PICSUM_CONFIG, BING_API_BASE } from './config.js';

const ALARM_NAME = 'wallpaper-refresh';

/**
 * 扩展安装或更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] 扩展已安装/更新');
  await setupAlarm();
});

/**
 * 扩展启动时初始化
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] 浏览器启动');
  await setupAlarm();
});

/**
 * 监听 alarm 触发
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[Background] 定时刷新壁纸触发');
    await refreshWallpaper();
  }
});

/**
 * 监听来自页面的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_ALARM') {
    setupAlarm().then(() => sendResponse({ success: true }));
    return true; // 保持消息通道打开
  }
  if (message.type === 'REFRESH_WALLPAPER') {
    refreshWallpaper().then(() => sendResponse({ success: true }));
    return true;
  }
});

/**
 * 设置定时器
 */
async function setupAlarm () {
  // 获取当前设置
  const { wallpaperSettings } = await chrome.storage.sync.get(['wallpaperSettings']);
  const interval = wallpaperSettings?.interval || 86400000; // 默认 24 小时

  // 清除旧的定时器
  await chrome.alarms.clear(ALARM_NAME);

  // 如果间隔为 0（手动更换），不设置定时器
  if (interval === 0) {
    console.log('[Background] 手动更换模式，不设置定时器');
    return;
  }

  // 转换为分钟（alarms API 使用分钟）
  const periodInMinutes = interval / 60000;

  // 创建定时器
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: periodInMinutes,
    delayInMinutes: periodInMinutes // 首次触发也按间隔时间
  });

  console.log(`[Background] 定时器已设置，间隔: ${periodInMinutes} 分钟`);
}

/**
 * 刷新壁纸
 */
async function refreshWallpaper () {
  const { wallpaperSettings } = await chrome.storage.sync.get(['wallpaperSettings']);

  if (!wallpaperSettings || wallpaperSettings.source === 'none') {
    console.log('[Background] 壁纸已禁用，跳过刷新');
    return;
  }

  // 对于 Bing，检查是否已经是今天的壁纸
  if (wallpaperSettings.source === 'bing') {
    const today = getTodayDateString();
    if (wallpaperSettings.lastBingDate === today) {
      console.log('[Background] Bing 壁纸今天已刷新，跳过');
      return;
    }
  }

  let wallpaper = null;

  try {
    switch (wallpaperSettings.source) {
      case 'picsum':
        wallpaper = await fetchPicsum();
        break;
      case 'bing':
        wallpaper = await fetchBing();
        break;
    }

    if (wallpaper) {
      wallpaperSettings.currentWallpaper = wallpaper;
      wallpaperSettings.lastRefresh = Date.now();
      // 如果是 Bing，记录当前日期
      if (wallpaperSettings.source === 'bing') {
        wallpaperSettings.lastBingDate = getTodayDateString();
      }
      await chrome.storage.sync.set({ wallpaperSettings });
      console.log('[Background] 壁纸已更新:', wallpaper.url);
    }
  } catch (error) {
    console.error('[Background] 刷新壁纸失败:', error);
  }
}

/**
 * 从 Picsum Photos 获取壁纸
 */
async function fetchPicsum () {
  const { width, height } = PICSUM_CONFIG;
  const randomSeed = Date.now();
  const sourceUrl = `https://picsum.photos/${width}/${height}?random=${randomSeed}`;

  try {
    const response = await fetch(sourceUrl);
    const finalUrl = response.url;

    return {
      url: finalUrl,
      source: 'picsum',
      author: 'Picsum Photos',
      link: 'https://picsum.photos'
    };
  } catch (error) {
    console.error('[Background] Picsum 请求失败:', error);
    return null;
  }
}

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getTodayDateString () {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 从 Bing 获取每日壁纸
 * 固定使用 idx=0 获取当天的图片
 */
async function fetchBing () {
  try {
    // 固定获取当天的图片（idx=0）
    const apiUrl = `${BING_API_BASE}&idx=0`;

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
    console.error('[Background] Bing 请求失败:', error);
    return null;
  }
}

