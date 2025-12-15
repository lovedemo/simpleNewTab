/**
 * 快捷方式模块 - 处理快捷链接的增删改查，支持分页
 */

import { DEFAULT_SHORTCUTS } from './config.js';
import { getSync, setSync, onChanged } from './storage.js';
import { getSettings, onSettingsChange } from './settings.js';
import { getFaviconUrl, getInitial, loadFaviconAsBlob, getCachedFavicon } from './favicon.js';

let shortcuts = [];
let shortcutsContainer;
let shortcutsPages;
let prevPageBtn;
let nextPageBtn;
let pageDots;
let modalOverlay;
let shortcutNameInput;
let shortcutUrlInput;
let confirmBtn;
let cancelBtn;
let contextMenu;
let editShortcutBtn;
let deleteShortcutBtn;

let editingIndex = null;
let contextMenuTarget = null;
let currentPage = 0;
let totalPages = 1;

// 布局设置
let itemsPerRow = 6;
let rowsPerPage = 2;

// 拖拽相关状态
let draggedIndex = null;
let draggedElement = null;
let dragOverElement = null;
let autoPageChangeTimer = null;
const AUTO_PAGE_CHANGE_DELAY = 500; // 拖拽到边缘后自动翻页的延迟

/**
 * 初始化快捷方式模块
 */
export async function init () {
  // 获取 DOM 元素
  shortcutsContainer = document.getElementById('shortcutsContainer');
  shortcutsPages = document.getElementById('shortcutsPages');
  prevPageBtn = document.getElementById('prevPageBtn');
  nextPageBtn = document.getElementById('nextPageBtn');
  pageDots = document.getElementById('pageDots');
  modalOverlay = document.getElementById('modalOverlay');
  shortcutNameInput = document.getElementById('shortcutName');
  shortcutUrlInput = document.getElementById('shortcutUrl');
  confirmBtn = document.getElementById('confirmBtn');
  cancelBtn = document.getElementById('cancelBtn');
  contextMenu = document.getElementById('contextMenu');
  editShortcutBtn = document.getElementById('editShortcut');
  deleteShortcutBtn = document.getElementById('deleteShortcut');

  // 加载布局设置
  const settings = getSettings();
  itemsPerRow = settings.itemsPerRow;
  rowsPerPage = settings.rowsPerPage;

  // 监听设置变化
  onSettingsChange((newSettings) => {
    itemsPerRow = newSettings.itemsPerRow;
    rowsPerPage = newSettings.rowsPerPage;
    render();
  });

  // 加载快捷方式
  await loadShortcuts();

  // 绑定事件
  cancelBtn.addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', handleConfirm);
  // 移除点击外部关闭的逻辑，防止误操作

  editShortcutBtn.addEventListener('click', () => {
    if (contextMenuTarget !== null) {
      openModal(true, contextMenuTarget);
      hideContextMenu();
    }
  });

  deleteShortcutBtn.addEventListener('click', () => {
    if (contextMenuTarget !== null) {
      deleteShortcut(contextMenuTarget);
      hideContextMenu();
    }
  });

  // 分页按钮
  prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
  nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));

  // 分页按钮的拖拽事件（支持跨页拖拽）
  setupPageBtnDragEvents(prevPageBtn, -1);
  setupPageBtnDragEvents(nextPageBtn, 1);

  // 触摸板/鼠标滚轮滑动支持
  const viewport = document.querySelector('.shortcuts-viewport');
  let accumulatedDeltaX = 0;
  let scrollTimeout;
  let isPageChanging = false; // 翻页冷却标志
  const SWIPE_THRESHOLD = 150; // 滑动阈值（增大以降低灵敏度）
  const PAGE_CHANGE_COOLDOWN = 400; // 翻页冷却时间（毫秒）

  viewport.addEventListener('wheel', (e) => {
    // 只处理有多页的情况
    if (totalPages <= 1) return;

    // 翻页冷却中，忽略滑动
    if (isPageChanging) return;

    // 检测水平滑动
    const deltaX = e.deltaX;

    // 如果是水平滑动
    if (Math.abs(deltaX) > 0) {
      e.preventDefault();

      // 累积滑动距离
      accumulatedDeltaX += deltaX;

      // 重置累积的定时器
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        accumulatedDeltaX = 0;
      }, 300);

      // 达到阈值则翻页
      if (accumulatedDeltaX > SWIPE_THRESHOLD) {
        goToPage(currentPage + 1);
        accumulatedDeltaX = 0;
        // 启动冷却
        isPageChanging = true;
        setTimeout(() => { isPageChanging = false; }, PAGE_CHANGE_COOLDOWN);
      } else if (accumulatedDeltaX < -SWIPE_THRESHOLD) {
        goToPage(currentPage - 1);
        accumulatedDeltaX = 0;
        // 启动冷却
        isPageChanging = true;
        setTimeout(() => { isPageChanging = false; }, PAGE_CHANGE_COOLDOWN);
      }
    }
  }, { passive: false });

  // 触摸滑动支持（移动端）
  let touchStartX = 0;
  let touchEndX = 0;

  viewport.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  viewport.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe () {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;

    if (diff > swipeThreshold) {
      // 向左滑动，下一页
      goToPage(currentPage + 1);
    } else if (diff < -swipeThreshold) {
      // 向右滑动，上一页
      goToPage(currentPage - 1);
    }
  }

  // 点击其他地方关闭右键菜单
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // 监听云端同步变化
  onChanged((changes, areaName) => {
    if (areaName === 'sync' && changes.shortcuts) {
      shortcuts = changes.shortcuts.newValue || [];
      render();
    }
  });
}

/**
 * 加载快捷方式
 */
async function loadShortcuts () {
  const { shortcuts: saved } = await getSync(['shortcuts']);
  // 直接使用从 Chrome storage 读取的数据，不添加默认值
  shortcuts = saved || [];
  render();
}

/**
 * 保存快捷方式
 */
function saveShortcuts () {
  setSync({ shortcuts });
}

/**
 * 计算分页信息
 */
function calculatePagination () {
  const itemsPerPage = itemsPerRow * rowsPerPage;
  // 减1是为了给"添加"按钮留位置
  const shortcutCount = shortcuts.length;

  // 计算需要多少页（考虑添加按钮）
  totalPages = Math.max(1, Math.ceil((shortcutCount + 1) / itemsPerPage));

  // 确保当前页在有效范围内
  if (currentPage >= totalPages) {
    currentPage = totalPages - 1;
  }
}

/**
 * 渲染快捷方式列表（分页）
 */
function render () {
  calculatePagination();

  const itemsPerPage = itemsPerRow * rowsPerPage;

  shortcutsPages.innerHTML = '';

  // 设置 CSS 变量用于布局
  document.documentElement.style.setProperty('--items-per-row', itemsPerRow);
  document.documentElement.style.setProperty('--rows-per-page', rowsPerPage);

  // 创建每一页
  for (let page = 0; page < totalPages; page++) {
    const pageEl = document.createElement('div');
    pageEl.className = 'shortcuts-page';

    const startIdx = page * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, shortcuts.length + 1);

    // 添加该页的快捷方式
    for (let i = startIdx; i < endIdx; i++) {
      if (i < shortcuts.length) {
        // 快捷方式项
        const shortcut = shortcuts[i];
        const item = createShortcutItem(shortcut, i);
        pageEl.appendChild(item);
      } else if (i === shortcuts.length) {
        // 添加按钮（只在最后一个快捷方式后面显示）
        const addItem = createAddButton();
        pageEl.appendChild(addItem);
      }
    }

    shortcutsPages.appendChild(pageEl);
  }

  // 更新分页 UI
  updatePaginationUI();
  goToPage(currentPage, false);
}

/**
 * 创建快捷方式项
 */
function createShortcutItem (shortcut, index) {
  const item = document.createElement('a');
  item.className = 'shortcut-item';
  item.href = shortcut.url;
  item.dataset.index = index;

  // 启用拖拽
  item.draggable = true;

  const iconEl = document.createElement('div');
  iconEl.className = 'shortcut-icon';

  const faviconUrl = getFaviconUrl(shortcut.url);
  const cached = faviconUrl ? getCachedFavicon(faviconUrl) : null;

  // 根据缓存状态决定显示方式
  if (cached && cached.status === 'loaded' && cached.blobUrl) {
    // 已缓存且成功，直接显示图片
    const img = document.createElement('img');
    img.src = cached.blobUrl;
    img.alt = shortcut.name;
    iconEl.appendChild(img);
  } else if (cached && cached.status === 'failed') {
    // 已缓存且失败，显示文字
    iconEl.textContent = getInitial(shortcut.name);
  } else if (faviconUrl) {
    // 未缓存或加载中，先显示文字，然后尝试加载
    iconEl.textContent = getInitial(shortcut.name);

    // 异步加载 favicon
    loadFaviconAsBlob(faviconUrl).then(result => {
      if (result.status === 'loaded' && result.blobUrl) {
        // 加载成功，替换为图片
        const img = document.createElement('img');
        img.src = result.blobUrl;
        img.alt = shortcut.name;
        iconEl.textContent = '';
        iconEl.appendChild(img);
      }
      // 失败则保持文字图标
    });
  } else {
    // 无 favicon URL，显示文字
    iconEl.textContent = getInitial(shortcut.name);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'shortcut-name';
  nameEl.textContent = shortcut.name;

  item.appendChild(iconEl);
  item.appendChild(nameEl);

  // 右键菜单
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, index);
  });

  // 拖拽事件
  item.addEventListener('dragstart', handleDragStart);
  item.addEventListener('dragend', handleDragEnd);
  item.addEventListener('dragover', handleDragOver);
  item.addEventListener('dragenter', handleDragEnter);
  item.addEventListener('dragleave', handleDragLeave);
  item.addEventListener('drop', handleDrop);

  // 阻止拖拽时的链接跳转
  item.addEventListener('click', (e) => {
    if (draggedIndex !== null) {
      e.preventDefault();
    }
  });

  return item;
}

/**
 * 创建添加按钮
 */
function createAddButton () {
  const addItem = document.createElement('button');
  addItem.className = 'shortcut-item add-shortcut-btn';
  addItem.title = '添加快捷方式';

  const addIconEl = document.createElement('div');
  addIconEl.className = 'shortcut-icon add-icon';
  addIconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>`;

  const addNameEl = document.createElement('span');
  addNameEl.className = 'shortcut-name';
  addNameEl.textContent = '添加';

  addItem.appendChild(addIconEl);
  addItem.appendChild(addNameEl);
  addItem.addEventListener('click', () => openModal());

  return addItem;
}

/**
 * 更新分页 UI
 */
function updatePaginationUI () {
  const hasMultiplePages = totalPages > 1;

  // 显示/隐藏分页按钮
  prevPageBtn.classList.toggle('visible', hasMultiplePages);
  nextPageBtn.classList.toggle('visible', hasMultiplePages);
  pageDots.classList.toggle('visible', hasMultiplePages);

  // 更新按钮状态
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage === totalPages - 1;

  // 更新分页指示器
  pageDots.innerHTML = '';
  for (let i = 0; i < totalPages; i++) {
    const dot = document.createElement('button');
    dot.className = 'page-dot';
    if (i === currentPage) dot.classList.add('active');
    dot.addEventListener('click', () => goToPage(i));
    pageDots.appendChild(dot);
  }
}

/**
 * 跳转到指定页
 */
function goToPage (page, animate = true) {
  if (page < 0 || page >= totalPages) return;

  currentPage = page;

  const offset = -page * 100;
  shortcutsPages.style.transition = animate ? 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
  shortcutsPages.style.transform = `translateX(${offset}%)`;

  // 更新按钮状态
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage === totalPages - 1;

  // 更新分页指示器
  const dots = pageDots.querySelectorAll('.page-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentPage);
  });
}

/**
 * 打开添加/编辑弹窗
 */
function openModal (isEdit = false, index = null) {
  editingIndex = isEdit ? index : null;

  if (isEdit && index !== null) {
    shortcutNameInput.value = shortcuts[index].name;
    shortcutUrlInput.value = shortcuts[index].url;
    document.querySelector('.modal-title').textContent = '编辑快捷方式';
    confirmBtn.textContent = '保存';
  } else {
    shortcutNameInput.value = '';
    shortcutUrlInput.value = '';
    document.querySelector('.modal-title').textContent = '添加快捷方式';
    confirmBtn.textContent = '添加';
  }

  modalOverlay.classList.add('active');
  shortcutNameInput.focus();
}

/**
 * 关闭弹窗
 */
export function closeModal () {
  modalOverlay.classList.remove('active');
  editingIndex = null;
}

/**
 * 确认添加/编辑
 */
function handleConfirm () {
  const name = shortcutNameInput.value.trim();
  let url = shortcutUrlInput.value.trim();

  if (!name || !url) {
    alert('请填写名称和网址');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  if (editingIndex !== null) {
    shortcuts[editingIndex] = { name, url };
  } else {
    shortcuts.push({ name, url });
  }

  saveShortcuts();
  render();
  closeModal();
}

/**
 * 删除快捷方式
 */
function deleteShortcut (index) {
  shortcuts.splice(index, 1);
  saveShortcuts();
  render();
}

/**
 * 显示右键菜单
 */
function showContextMenu (e, index) {
  contextMenuTarget = index;

  const x = e.clientX;
  const y = e.clientY;
  const menuWidth = 140;
  const menuHeight = 80;

  let posX = x;
  let posY = y;

  if (x + menuWidth > window.innerWidth) {
    posX = window.innerWidth - menuWidth - 10;
  }
  if (y + menuHeight > window.innerHeight) {
    posY = window.innerHeight - menuHeight - 10;
  }

  contextMenu.style.left = `${posX}px`;
  contextMenu.style.top = `${posY}px`;
  contextMenu.classList.add('active');
}

/**
 * 隐藏右键菜单
 */
export function hideContextMenu () {
  contextMenu.classList.remove('active');
  contextMenuTarget = null;
}

/**
 * 批量导入快捷方式
 * @param {Array} items - 要导入的快捷方式数组 [{name, url}, ...]
 * @returns {number} 导入成功的数量
 */
export function importShortcuts (items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  let importCount = 0;
  items.forEach(item => {
    if (item.name && item.url) {
      // 检查是否已存在相同的 URL
      const exists = shortcuts.some(s => s.url === item.url);
      if (!exists) {
        shortcuts.push({
          name: item.name,
          url: item.url
        });
        importCount++;
      }
    }
  });

  if (importCount > 0) {
    saveShortcuts();
    render();
  }

  return importCount;
}

/**
 * 解析 Infinity 备份文件并导入
 * @param {Object} data - 解析后的 JSON 数据
 * @returns {Object} { success: boolean, count: number, message: string }
 */
export function parseAndImportInfinityBackup (data) {
  try {
    // 检查是否是本插件导出的格式
    if (data && data.type === 'simpleNewTab' && Array.isArray(data.shortcuts)) {
      const importCount = importShortcuts(data.shortcuts);
      if (importCount === 0) {
        return { success: true, count: 0, message: '所有快捷方式已存在，无需导入' };
      }
      return {
        success: true,
        count: importCount,
        message: `成功导入 ${importCount} 个快捷方式`
      };
    }

    // 检查是否是 Infinity 备份格式
    if (!data || !data.data || !data.data.site || !data.data.site.sites) {
      return { success: false, count: 0, message: '无效的备份文件格式' };
    }

    const sites = data.data.site.sites;
    const webItems = [];

    // 遍历二维数组，提取 type === "web" 的项目
    sites.forEach(page => {
      if (Array.isArray(page)) {
        page.forEach(site => {
          if (site.type === 'web' && site.target && site.name) {
            webItems.push({
              name: site.name,
              url: site.target
            });
          }
        });
      }
    });

    if (webItems.length === 0) {
      return { success: false, count: 0, message: '未找到可导入的网页快捷方式' };
    }

    const importCount = importShortcuts(webItems);

    if (importCount === 0) {
      return { success: true, count: 0, message: '所有快捷方式已存在，无需导入' };
    }

    return {
      success: true,
      count: importCount,
      message: `成功导入 ${importCount} 个快捷方式`
    };
  } catch (error) {
    console.error('解析备份文件失败:', error);
    return { success: false, count: 0, message: '解析文件失败: ' + error.message };
  }
}

/**
 * 导出所有快捷方式
 * @returns {Object} 导出的数据对象
 */
export function exportShortcuts () {
  return {
    type: 'simpleNewTab',
    version: '1.0',
    exportTime: new Date().toISOString(),
    shortcuts: [...shortcuts]
  };
}

/**
 * 获取快捷方式数量
 * @returns {number}
 */
export function getShortcutsCount () {
  return shortcuts.length;
}

/**
 * 清空所有快捷方式
 */
export function clearAllShortcuts () {
  shortcuts = [];
  saveShortcuts();
  render();
}

/**
 * 恢复默认快捷方式
 */
export function restoreDefaultShortcuts () {
  shortcuts = [...DEFAULT_SHORTCUTS];
  saveShortcuts();
  render();
}

// ==================== 拖拽排序相关函数 ====================

/**
 * 拖拽开始
 */
function handleDragStart (e) {
  draggedIndex = parseInt(e.currentTarget.dataset.index);
  draggedElement = e.currentTarget;

  // 设置拖拽数据
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedIndex);

  // 添加拖拽样式
  setTimeout(() => {
    draggedElement.classList.add('dragging');
  }, 0);

  // 显示分页按钮的拖拽区域
  if (totalPages > 1) {
    prevPageBtn.classList.add('drag-active');
    nextPageBtn.classList.add('drag-active');
  }
}

/**
 * 拖拽结束
 */
function handleDragEnd (e) {
  // 移除拖拽样式
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
  }

  // 移除所有拖拽相关样式
  document.querySelectorAll('.shortcut-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
  });

  // 隐藏分页按钮的拖拽区域
  prevPageBtn.classList.remove('drag-active');
  nextPageBtn.classList.remove('drag-active');

  // 清除自动翻页计时器
  clearAutoPageChange();

  // 重置状态
  draggedIndex = null;
  draggedElement = null;
  dragOverElement = null;
}

/**
 * 拖拽经过
 */
function handleDragOver (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  // 检查是否需要自动翻页（拖拽到页面边缘）
  checkAutoPageChange(e.clientX);
}

/**
 * 拖拽进入
 */
function handleDragEnter (e) {
  e.preventDefault();
  const target = e.currentTarget;

  if (target === draggedElement) return;
  if (target.classList.contains('add-shortcut-btn')) return;

  // 清除其他元素的 drag-over 样式
  document.querySelectorAll('.shortcut-item').forEach(item => {
    if (item !== target) {
      item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
    }
  });

  // 添加拖拽提示样式
  const targetIndex = parseInt(target.dataset.index);
  if (targetIndex < draggedIndex) {
    target.classList.add('drag-over', 'drag-over-left');
  } else {
    target.classList.add('drag-over', 'drag-over-right');
  }

  dragOverElement = target;
}

/**
 * 拖拽离开
 */
function handleDragLeave (e) {
  const target = e.currentTarget;
  // 检查是否真的离开了元素（而不是进入子元素）
  if (!target.contains(e.relatedTarget)) {
    target.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
  }
}

/**
 * 放置
 */
function handleDrop (e) {
  e.preventDefault();

  const target = e.currentTarget;
  if (target === draggedElement) return;
  if (target.classList.contains('add-shortcut-btn')) return;

  const targetIndex = parseInt(target.dataset.index);

  if (draggedIndex !== null && targetIndex !== draggedIndex) {
    // 移动快捷方式
    moveShortcut(draggedIndex, targetIndex);
  }

  // 清除样式
  target.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
}

/**
 * 移动快捷方式
 */
function moveShortcut (fromIndex, toIndex) {
  // 从数组中取出被拖拽的元素
  const [movedItem] = shortcuts.splice(fromIndex, 1);
  // 插入到目标位置
  shortcuts.splice(toIndex, 0, movedItem);

  // 保存并重新渲染
  saveShortcuts();
  render();
}

/**
 * 检查是否需要自动翻页
 */
function checkAutoPageChange (clientX) {
  if (totalPages <= 1) return;

  const containerRect = shortcutsContainer.getBoundingClientRect();
  const edgeThreshold = 60; // 边缘区域宽度

  // 检查是否在左边缘
  if (clientX < containerRect.left + edgeThreshold && currentPage > 0) {
    startAutoPageChange(-1);
  }
  // 检查是否在右边缘
  else if (clientX > containerRect.right - edgeThreshold && currentPage < totalPages - 1) {
    startAutoPageChange(1);
  }
  // 不在边缘区域
  else {
    clearAutoPageChange();
  }
}

/**
 * 开始自动翻页计时
 */
function startAutoPageChange (direction) {
  if (autoPageChangeTimer) return; // 已经在计时了

  // 高亮显示翻页按钮
  if (direction < 0) {
    prevPageBtn.classList.add('drag-highlight');
  } else {
    nextPageBtn.classList.add('drag-highlight');
  }

  autoPageChangeTimer = setTimeout(() => {
    goToPage(currentPage + direction);
    autoPageChangeTimer = null;
    prevPageBtn.classList.remove('drag-highlight');
    nextPageBtn.classList.remove('drag-highlight');
  }, AUTO_PAGE_CHANGE_DELAY);
}

/**
 * 清除自动翻页计时
 */
function clearAutoPageChange () {
  if (autoPageChangeTimer) {
    clearTimeout(autoPageChangeTimer);
    autoPageChangeTimer = null;
  }
  prevPageBtn.classList.remove('drag-highlight');
  nextPageBtn.classList.remove('drag-highlight');
}

/**
 * 设置分页按钮的拖拽事件
 */
function setupPageBtnDragEvents (btn, direction) {
  let pageChangeTimer = null;
  let lastPageChangeTime = 0;
  const PAGE_CHANGE_COOLDOWN = 400; // 连续翻页的冷却时间

  btn.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    // 检查目标页是否有效
    const targetPage = currentPage + direction;
    if (targetPage < 0 || targetPage >= totalPages) return;

    // 高亮按钮
    btn.classList.add('drag-highlight');

    // 延迟翻页，避免误触
    if (!pageChangeTimer) {
      const now = Date.now();
      const delay = now - lastPageChangeTime < PAGE_CHANGE_COOLDOWN ? 400 : 250;

      pageChangeTimer = setTimeout(() => {
        const targetPage = currentPage + direction;
        if (targetPage >= 0 && targetPage < totalPages) {
          goToPage(targetPage);
          lastPageChangeTime = Date.now();
        }
        pageChangeTimer = null;
        btn.classList.remove('drag-highlight');
      }, delay);
    }
  });

  btn.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 如果按钮没有高亮且可以翻页，重新触发 dragenter 逻辑
    const targetPage = currentPage + direction;
    if (targetPage >= 0 && targetPage < totalPages && !btn.classList.contains('drag-highlight') && !pageChangeTimer) {
      btn.classList.add('drag-highlight');
      const now = Date.now();
      const delay = now - lastPageChangeTime < PAGE_CHANGE_COOLDOWN ? 400 : 250;

      pageChangeTimer = setTimeout(() => {
        const targetPage = currentPage + direction;
        if (targetPage >= 0 && targetPage < totalPages) {
          goToPage(targetPage);
          lastPageChangeTime = Date.now();
        }
        pageChangeTimer = null;
        btn.classList.remove('drag-highlight');
      }, delay);
    }
  });

  btn.addEventListener('dragleave', (e) => {
    // 检查是否真的离开了按钮
    if (!btn.contains(e.relatedTarget)) {
      btn.classList.remove('drag-highlight');
      if (pageChangeTimer) {
        clearTimeout(pageChangeTimer);
        pageChangeTimer = null;
      }
    }
  });

  btn.addEventListener('drop', (e) => {
    e.preventDefault();
    btn.classList.remove('drag-highlight');
    if (pageChangeTimer) {
      clearTimeout(pageChangeTimer);
      pageChangeTimer = null;
    }
  });
}
