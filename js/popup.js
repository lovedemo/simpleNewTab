/**
 * Popup 脚本 - 快速收藏当前页面
 */

import { setFaviconForElement, getInitial } from './favicon.js';

let currentTab = null;
let shortcuts = [];

// DOM 元素
const siteIcon = document.getElementById('siteIcon');
const siteTitle = document.getElementById('siteTitle');
const siteUrl = document.getElementById('siteUrl');
const addBtn = document.getElementById('addBtn');
const removeBtn = document.getElementById('removeBtn');
const statusMessage = document.getElementById('statusMessage');

/**
 * 初始化
 */
async function init () {
  // 获取当前标签页信息
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // 检查是否是有效页面
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    showUnavailable('无法收藏此页面');
    return;
  }

  // 显示页面信息
  displayPageInfo(tab);

  // 加载快捷方式并检查状态
  await loadShortcuts();
  updateButtonState();
}

/**
 * 显示页面信息
 */
async function displayPageInfo (tab) {
  siteTitle.value = tab.title || '未知标题';
  siteUrl.value = tab.url;

  // 使用共享的 favicon 模块设置图标
  await setFaviconForElement(siteIcon, tab.url, tab.title || tab.url);
}

/**
 * 加载快捷方式
 */
async function loadShortcuts () {
  const { shortcuts: saved } = await chrome.storage.sync.get(['shortcuts']);
  shortcuts = saved || [];
}

/**
 * 保存快捷方式
 */
async function saveShortcuts () {
  await chrome.storage.sync.set({ shortcuts });
}

/**
 * 检查当前页面是否已收藏
 */
function isBookmarked () {
  if (!currentTab) return false;
  return shortcuts.some(s => s.url === currentTab.url);
}

/**
 * 更新按钮状态
 */
function updateButtonState () {
  if (isBookmarked()) {
    addBtn.style.display = 'none';
    removeBtn.style.display = 'flex';
  } else {
    addBtn.style.display = 'flex';
    removeBtn.style.display = 'none';
  }
}

/**
 * 添加到快捷方式
 */
async function addToShortcuts () {
  const title = siteTitle.value.trim();
  const url = siteUrl.value.trim();

  if (!title || !url) {
    showError('请填写标题和网址');
    return;
  }

  shortcuts.push({
    name: title,
    url: url
  });

  await saveShortcuts();
  // 更新 currentTab 的 url 以便正确检测状态
  currentTab.url = url;
  updateButtonState();
  showSuccess('已添加到快捷方式');
}

/**
 * 从快捷方式移除
 */
async function removeFromShortcuts () {
  if (!currentTab) return;

  const index = shortcuts.findIndex(s => s.url === currentTab.url);
  if (index !== -1) {
    shortcuts.splice(index, 1);
    await saveShortcuts();
    updateButtonState();
    showSuccess('已从快捷方式移除');
  }
}

/**
 * 显示成功消息
 */
function showSuccess (message) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message success';
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 2000);
}

/**
 * 显示错误消息
 */
function showError (message) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message error';
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 2000);
}

/**
 * 显示不可用状态
 */
function showUnavailable (message) {
  siteTitle.value = message;
  siteTitle.disabled = true;
  siteUrl.value = '';
  siteUrl.disabled = true;
  siteIcon.textContent = '⚠️';
  addBtn.style.display = 'none';
  removeBtn.style.display = 'none';
}

// 绑定事件
addBtn.addEventListener('click', addToShortcuts);
removeBtn.addEventListener('click', removeFromShortcuts);

// 初始化
init();
