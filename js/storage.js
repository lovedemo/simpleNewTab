/**
 * 存储模块 - 处理 Chrome Storage API
 */

/**
 * 从 sync storage 获取数据
 */
export function getSync (keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

/**
 * 保存到 sync storage
 */
export function setSync (data) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, resolve);
  });
}

/**
 * 从 local storage 获取数据
 */
export function getLocal (keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

/**
 * 保存到 local storage
 */
export function setLocal (data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

/**
 * 监听存储变化
 */
export function onChanged (callback) {
  chrome.storage.onChanged.addListener(callback);
}

