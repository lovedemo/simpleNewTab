/**
 * 应用设置模块 - 管理全局设置
 */

import { getSync, setSync, onChanged } from './storage.js';
import { parseAndImportInfinityBackup, exportShortcuts, getShortcutsCount, clearAllShortcuts, restoreDefaultShortcuts } from './shortcuts.js';

// 默认设置
const DEFAULT_SETTINGS = {
  defaultEngine: 'google',
  itemsPerRow: 6,
  rowsPerPage: 2
};

// 当前设置
let settings = { ...DEFAULT_SETTINGS };

// 回调函数
let onSettingsChangeCallbacks = [];

// DOM 元素
let modalOverlay;
let defaultEngineSelect;
let itemsPerRowSelect;
let rowsPerPageSelect;
let closeBtn;
let appSettingsBtn;
let importFileInput;
let importBtn;
let importStatus;
let exportBtn;
let shortcutCount;
let clearAllBtn;
let confirmClearModal;
let cancelClearBtn;
let confirmClearBtn;
let restoreDefaultBtn;
let settingsTabs;
let settingsPanels;

/**
 * 初始化设置模块
 */
export async function init () {
  // 获取 DOM 元素
  modalOverlay = document.getElementById('appSettingsModal');
  defaultEngineSelect = document.getElementById('defaultEngineSelect');
  itemsPerRowSelect = document.getElementById('itemsPerRowSelect');
  rowsPerPageSelect = document.getElementById('rowsPerPageSelect');
  closeBtn = document.getElementById('closeAppSettingsBtn');
  appSettingsBtn = document.getElementById('appSettingsBtn');
  importFileInput = document.getElementById('importFileInput');
  importBtn = document.getElementById('importBtn');
  importStatus = document.getElementById('importStatus');
  exportBtn = document.getElementById('exportBtn');
  shortcutCount = document.getElementById('shortcutCount');
  clearAllBtn = document.getElementById('clearAllBtn');
  confirmClearModal = document.getElementById('confirmClearModal');
  cancelClearBtn = document.getElementById('cancelClearBtn');
  confirmClearBtn = document.getElementById('confirmClearBtn');
  restoreDefaultBtn = document.getElementById('restoreDefaultBtn');
  settingsTabs = document.querySelectorAll('.settings-tab');
  settingsPanels = document.querySelectorAll('.settings-panel');

  // 加载设置
  await loadSettings();

  // 绑定事件
  bindEvents();

  // 监听云端同步变化
  onChanged((changes, areaName) => {
    if (areaName === 'sync' && changes.appSettings) {
      const newSettings = changes.appSettings.newValue;
      if (newSettings) {
        settings = { ...DEFAULT_SETTINGS, ...newSettings };
        updateUI();
        notifySettingsChange();
      }
    }
  });
}

/**
 * 绑定事件
 */
function bindEvents () {
  // 打开设置
  appSettingsBtn.addEventListener('click', openModal);

  // 关闭设置
  closeBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // 设置变更
  defaultEngineSelect.addEventListener('change', () => {
    settings.defaultEngine = defaultEngineSelect.value;
    saveSettings();
    notifySettingsChange();
  });

  itemsPerRowSelect.addEventListener('change', () => {
    settings.itemsPerRow = parseInt(itemsPerRowSelect.value);
    saveSettings();
    notifySettingsChange();
  });

  rowsPerPageSelect.addEventListener('change', () => {
    settings.rowsPerPage = parseInt(rowsPerPageSelect.value);
    saveSettings();
    notifySettingsChange();
  });

  // 导入按钮点击事件
  importBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  // 文件选择事件
  importFileInput.addEventListener('change', handleFileImport);

  // 导出按钮点击事件
  exportBtn.addEventListener('click', handleExport);

  // 清空按钮点击事件
  clearAllBtn.addEventListener('click', () => {
    confirmClearModal.classList.add('active');
  });

  // 取消清空
  cancelClearBtn.addEventListener('click', () => {
    confirmClearModal.classList.remove('active');
  });

  // 确认清空
  confirmClearBtn.addEventListener('click', handleClearAll);

  // 恢复默认
  restoreDefaultBtn.addEventListener('click', handleRestoreDefault);

  // 点击弹窗外部关闭确认框
  confirmClearModal.addEventListener('click', (e) => {
    if (e.target === confirmClearModal) {
      confirmClearModal.classList.remove('active');
    }
  });

  // Tab 切换事件
  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      switchTab(targetTab);
    });
  });
}

/**
 * 加载设置
 */
async function loadSettings () {
  const { appSettings } = await getSync(['appSettings']);
  if (appSettings) {
    settings = { ...DEFAULT_SETTINGS, ...appSettings };
  }
  updateUI();
}

/**
 * 保存设置
 */
function saveSettings () {
  setSync({ appSettings: settings });
}

/**
 * 更新 UI
 */
function updateUI () {
  defaultEngineSelect.value = settings.defaultEngine;
  itemsPerRowSelect.value = settings.itemsPerRow;
  rowsPerPageSelect.value = settings.rowsPerPage;
}

/**
 * 打开设置弹窗
 */
function openModal () {
  modalOverlay.classList.add('active');
  updateUI();
  updateShortcutCount();
}

/**
 * 关闭设置弹窗
 */
export function closeModal () {
  modalOverlay.classList.remove('active');
}

/**
 * 获取当前设置
 */
export function getSettings () {
  return { ...settings };
}

/**
 * 注册设置变更回调
 */
export function onSettingsChange (callback) {
  onSettingsChangeCallbacks.push(callback);
}

/**
 * 通知设置变更
 */
function notifySettingsChange () {
  onSettingsChangeCallbacks.forEach(callback => callback(settings));
}

/**
 * 处理文件导入
 */
function handleFileImport (e) {
  const file = e.target.files[0];
  if (!file) return;

  // 重置状态
  setImportStatus('loading', '正在导入...');

  const reader = new FileReader();
  
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      const result = parseAndImportInfinityBackup(data);
      
      if (result.success) {
        setImportStatus('success', result.message);
        updateShortcutCount(); // 更新快捷方式数量显示
      } else {
        setImportStatus('error', result.message);
      }
    } catch (error) {
      console.error('解析文件失败:', error);
      setImportStatus('error', '文件解析失败，请确保是有效的 JSON 文件');
    }
  };

  reader.onerror = () => {
    setImportStatus('error', '文件读取失败');
  };

  reader.readAsText(file);
  
  // 重置 input 以便可以重复选择同一文件
  e.target.value = '';
}

/**
 * 设置导入状态显示
 */
function setImportStatus (type, message) {
  importStatus.className = 'import-status ' + type;
  importStatus.textContent = message;
  
  // 成功或错误状态 5 秒后自动清除
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      importStatus.className = 'import-status';
      importStatus.textContent = '';
    }, 5000);
  }
}

/**
 * 处理导出
 */
function handleExport () {
  const data = exportShortcuts();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  // 创建下载链接
  const a = document.createElement('a');
  a.href = url;
  a.download = `shortcuts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 处理清空所有
 */
function handleClearAll () {
  clearAllShortcuts();
  confirmClearModal.classList.remove('active');
  updateShortcutCount();
  
  // 显示成功提示
  setImportStatus('success', '已清空所有快捷方式');
}

/**
 * 处理恢复默认
 */
function handleRestoreDefault () {
  restoreDefaultShortcuts();
  confirmClearModal.classList.remove('active');
  updateShortcutCount();
  
  // 显示成功提示
  setImportStatus('success', '已恢复默认快捷方式');
}

/**
 * 切换 Tab
 */
function switchTab (tabName) {
  // 更新 tab 按钮状态
  settingsTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // 更新面板显示
  settingsPanels.forEach(panel => {
    const panelName = panel.id.replace('Panel', '');
    panel.classList.toggle('active', panelName === tabName);
  });

  // 如果切换到数据面板，更新快捷方式数量
  if (tabName === 'data') {
    updateShortcutCount();
  }
}

/**
 * 更新快捷方式数量显示
 */
function updateShortcutCount () {
  const count = getShortcutsCount();
  shortcutCount.textContent = `当前共有 ${count} 个快捷方式`;
}

