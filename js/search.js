/**
 * 搜索模块 - 处理搜索功能
 */

import { SEARCH_ENGINES } from './config.js';
import { getSync, setSync } from './storage.js';
import { getSettings, onSettingsChange } from './settings.js';

let searchInput;
let shortcutBtns;
let currentEngine = 'google';

/**
 * 初始化搜索模块
 */
export async function init () {
  searchInput = document.getElementById('searchInput');
  shortcutBtns = document.querySelectorAll('.engine-btn');

  // 从应用设置获取默认搜索引擎
  const appSettings = getSettings();
  const defaultEngine = appSettings.defaultEngine || 'google';

  // 加载保存的搜索引擎
  const { searchEngine } = await getSync(['searchEngine']);
  if (searchEngine !== undefined) {
    // 已有保存的设置，直接使用
    setEngine(searchEngine, false);
  } else {
    // 首次使用，使用应用设置中的默认搜索引擎
    setEngine(defaultEngine, true);
  }

  // 监听应用设置变化
  onSettingsChange((newSettings) => {
    // 当默认搜索引擎设置变化时，更新当前搜索引擎
    if (newSettings.defaultEngine && newSettings.defaultEngine !== currentEngine) {
      setEngine(newSettings.defaultEngine, true);
    }
  });

  // 绑定事件
  searchInput.addEventListener('keypress', handleSearch);

  shortcutBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setEngine(btn.dataset.engine);
    });
  });
}

/**
 * 处理搜索
 */
function handleSearch (e) {
  if (e.key !== 'Enter') return;

  const query = searchInput.value.trim();
  if (!query) return;

  // 检查是否是 URL
  if (isValidUrl(query)) {
    let url = query;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    window.location.href = url;
  } else {
    // 使用搜索引擎
    const searchUrl = SEARCH_ENGINES[currentEngine] + encodeURIComponent(query);
    window.location.href = searchUrl;
  }
}

/**
 * 检查是否是有效 URL
 */
function isValidUrl (string) {
  const urlPattern = /^(https?:\/\/)?[\w\-]+(\.[\w\-]+)+[^\s]*$/i;
  return urlPattern.test(string);
}

/**
 * 设置搜索引擎
 */
export function setEngine (engine, save = true) {
  currentEngine = engine;

  // 更新按钮状态
  shortcutBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.engine === engine);
  });

  // 更新 placeholder
  const placeholders = {
    google: '搜索 Google 或输入网址',
    baidu: '搜索百度或输入网址',
    bing: '搜索 Bing 或输入网址'
  };
  searchInput.placeholder = placeholders[engine];

  // 保存设置
  if (save) {
    setSync({ searchEngine: engine });
  }
}

/**
 * 获取当前搜索引擎
 */
export function getEngine () {
  return currentEngine;
}
