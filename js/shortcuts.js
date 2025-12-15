/**
 * 快捷方式模块 - 处理快捷链接的增删改查，支持分页和文件夹
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

// 文件夹相关 DOM 元素
let folderModal;
let folderNameInput;
let folderItemsContainer;
let closeFolderBtn;
let folderManageBtn;
let isFolderManageMode = false; // 文件夹管理模式

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
const AUTO_PAGE_CHANGE_DELAY = 500;

// 文件夹拖拽相关
let draggedFolderItemIndex = null; // 文件夹内拖拽的索引
let currentOpenFolderIndex = null; // 当前打开的文件夹索引
let dropTargetIndex = null; // 放置目标索引
let isCreatingFolder = false; // 是否正在创建文件夹

// 高级拖拽状态
let isDraggingFromFolder = false; // 是否从文件夹拖出
let draggedItemData = null; // 被拖拽的项目数据（用于跨文件夹拖拽）
let folderHoverTimer = null; // 悬停在文件夹上的计时器
let outsideFolderTimer = null; // 拖出文件夹弹窗的计时器
let folderOpenTime = 0; // 文件夹打开的时间戳
let hasEnteredFolderModal = false; // 是否已进入过文件夹弹窗（用于判断是否真的拖出）
const FOLDER_HOVER_DELAY = 500; // 悬停打开文件夹的延迟
const OUTSIDE_FOLDER_DELAY = 600; // 拖出文件夹的延迟（增加一点）
const FOLDER_OPEN_COOLDOWN = 800; // 文件夹打开后的冷却时间

/**
 * 生成唯一ID
 */
function generateId (prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return prefix + timestamp + random;
}

/**
 * 判断是否为文件夹
 */
function isFolder (item) {
  return item && item.uuid && item.uuid.startsWith('folder-');
}

/**
 * 创建文件夹
 */
function createFolder (name, children = []) {
  return {
    name: name || '新文件夹',
    uuid: generateId('folder-'),
    id: generateId('folderId-'),
    children: children,
    updatetime: Date.now()
  };
}

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

  // 文件夹相关 DOM
  folderModal = document.getElementById('folderModal');
  folderNameInput = document.getElementById('folderNameInput');
  folderItemsContainer = document.getElementById('folderItemsContainer');
  closeFolderBtn = document.getElementById('closeFolderBtn');
  folderManageBtn = document.getElementById('folderManageBtn');

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

  // 分页按钮的拖拽事件
  setupPageBtnDragEvents(prevPageBtn, -1);
  setupPageBtnDragEvents(nextPageBtn, 1);

  // 触摸板/鼠标滚轮滑动支持
  const viewport = document.querySelector('.shortcuts-viewport');
  let accumulatedDeltaX = 0;
  let scrollTimeout;
  let isPageChanging = false;
  const SWIPE_THRESHOLD = 150;
  const PAGE_CHANGE_COOLDOWN = 400;

  viewport.addEventListener('wheel', (e) => {
    if (totalPages <= 1) return;
    if (isPageChanging) return;

    const deltaX = e.deltaX;

    if (Math.abs(deltaX) > 0) {
      e.preventDefault();
      accumulatedDeltaX += deltaX;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        accumulatedDeltaX = 0;
      }, 300);

      if (accumulatedDeltaX > SWIPE_THRESHOLD) {
        goToPage(currentPage + 1);
        accumulatedDeltaX = 0;
        isPageChanging = true;
        setTimeout(() => { isPageChanging = false; }, PAGE_CHANGE_COOLDOWN);
      } else if (accumulatedDeltaX < -SWIPE_THRESHOLD) {
        goToPage(currentPage - 1);
        accumulatedDeltaX = 0;
        isPageChanging = true;
        setTimeout(() => { isPageChanging = false; }, PAGE_CHANGE_COOLDOWN);
      }
    }
  }, { passive: false });

  // 触摸滑动支持
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
      goToPage(currentPage + 1);
    } else if (diff < -swipeThreshold) {
      goToPage(currentPage - 1);
    }
  }

  // 点击其他地方关闭右键菜单
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // 文件夹弹窗事件
  if (closeFolderBtn) {
    closeFolderBtn.addEventListener('click', closeFolderModal);
  }

  // 文件夹管理按钮事件
  if (folderManageBtn) {
    folderManageBtn.addEventListener('click', toggleFolderManageMode);
  }

  // 文件夹名称输入事件
  if (folderNameInput) {
    folderNameInput.addEventListener('input', handleFolderNameChange);
    folderNameInput.addEventListener('blur', handleFolderNameChange);
  }

  // 点击文件夹弹窗外部关闭
  if (folderModal) {
    folderModal.addEventListener('click', (e) => {
      if (e.target === folderModal) {
        closeFolderModal();
      }
    });
  }

  // 文件夹容器的 drop 事件（处理拖到空白区域）
  if (folderItemsContainer) {
    folderItemsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    folderItemsContainer.addEventListener('drop', handleFolderContainerDrop);
  }

  // 全局 dragend 监听，确保拖拽状态被正确重置
  document.addEventListener('dragend', handleGlobalDragEnd);

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
  const shortcutCount = shortcuts.length;
  totalPages = Math.max(1, Math.ceil((shortcutCount + 1) / itemsPerPage));

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

  document.documentElement.style.setProperty('--items-per-row', itemsPerRow);
  document.documentElement.style.setProperty('--rows-per-page', rowsPerPage);

  for (let page = 0; page < totalPages; page++) {
    const pageEl = document.createElement('div');
    pageEl.className = 'shortcuts-page';

    const startIdx = page * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, shortcuts.length + 1);

    for (let i = startIdx; i < endIdx; i++) {
      if (i < shortcuts.length) {
        const shortcut = shortcuts[i];
        const item = isFolder(shortcut)
          ? createFolderItem(shortcut, i)
          : createShortcutItem(shortcut, i);
        pageEl.appendChild(item);
      } else if (i === shortcuts.length) {
        const addItem = createAddButton();
        pageEl.appendChild(addItem);
      }
    }

    shortcutsPages.appendChild(pageEl);
  }

  updatePaginationUI();
  goToPage(currentPage, false);
}

/**
 * 创建快捷方式项
 */
function createShortcutItem (shortcut, index) {
  const item = document.createElement('a');
  item.className = 'shortcut-item';
  item.href = shortcut.url || shortcut.target || '#';
  item.dataset.index = index;

  item.draggable = true;

  const iconEl = document.createElement('div');
  iconEl.className = 'shortcut-icon';

  const faviconUrl = getFaviconUrl(shortcut.url || shortcut.target);
  const cached = faviconUrl ? getCachedFavicon(faviconUrl) : null;

  if (cached && cached.status === 'loaded' && cached.blobUrl) {
    const img = document.createElement('img');
    img.src = cached.blobUrl;
    img.alt = shortcut.name;
    iconEl.appendChild(img);
  } else if (cached && cached.status === 'failed') {
    iconEl.textContent = getInitial(shortcut.name);
  } else if (faviconUrl) {
    iconEl.textContent = getInitial(shortcut.name);

    loadFaviconAsBlob(faviconUrl).then(result => {
      if (result.status === 'loaded' && result.blobUrl) {
        const img = document.createElement('img');
        img.src = result.blobUrl;
        img.alt = shortcut.name;
        iconEl.textContent = '';
        iconEl.appendChild(img);
      }
    });
  } else {
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

  item.addEventListener('click', (e) => {
    if (draggedIndex !== null) {
      e.preventDefault();
    }
  });

  return item;
}

/**
 * 创建文件夹项
 */
function createFolderItem (folder, index) {
  const item = document.createElement('div');
  item.className = 'shortcut-item folder-item';
  item.dataset.index = index;
  item.draggable = true;

  // 文件夹图标容器
  const iconEl = document.createElement('div');
  iconEl.className = 'shortcut-icon folder-icon';

  // 显示文件夹内前4个项目的缩略图
  const gridEl = document.createElement('div');
  gridEl.className = 'folder-icon-grid';

  const children = folder.children || [];
  const displayCount = Math.min(4, children.length);

  for (let i = 0; i < 4; i++) {
    const cell = document.createElement('div');
    cell.className = 'folder-icon-cell';

    if (i < displayCount) {
      const child = children[i];
      const faviconUrl = getFaviconUrl(child.url || child.target);
      const cached = faviconUrl ? getCachedFavicon(faviconUrl) : null;

      if (cached && cached.status === 'loaded' && cached.blobUrl) {
        const img = document.createElement('img');
        img.src = cached.blobUrl;
        img.alt = child.name;
        cell.appendChild(img);
      } else if (faviconUrl) {
        cell.textContent = getInitial(child.name);
        loadFaviconAsBlob(faviconUrl).then(result => {
          if (result.status === 'loaded' && result.blobUrl) {
            const img = document.createElement('img');
            img.src = result.blobUrl;
            img.alt = child.name;
            cell.textContent = '';
            cell.appendChild(img);
          }
        });
      } else {
        cell.textContent = getInitial(child.name);
      }
    }

    gridEl.appendChild(cell);
  }

  iconEl.appendChild(gridEl);

  // 文件夹名称
  const nameEl = document.createElement('span');
  nameEl.className = 'shortcut-name';
  nameEl.textContent = folder.name;

  // 文件夹角标显示数量
  const badge = document.createElement('span');
  badge.className = 'folder-badge';
  badge.textContent = children.length;

  item.appendChild(iconEl);
  item.appendChild(nameEl);
  item.appendChild(badge);

  // 点击打开文件夹
  item.addEventListener('click', (e) => {
    if (draggedIndex !== null) {
      e.preventDefault();
      return;
    }
    openFolderModal(index);
  });

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

  prevPageBtn.classList.toggle('visible', hasMultiplePages);
  nextPageBtn.classList.toggle('visible', hasMultiplePages);
  pageDots.classList.toggle('visible', hasMultiplePages);

  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage === totalPages - 1;

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

  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage === totalPages - 1;

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
    const item = shortcuts[index];
    shortcutNameInput.value = item.name;
    shortcutUrlInput.value = item.url || item.target || '';
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
    // 如果是文件夹，不允许编辑 URL
    if (isFolder(shortcuts[editingIndex])) {
      shortcuts[editingIndex].name = name;
    } else {
      shortcuts[editingIndex] = { name, url };
    }
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

// ==================== 文件夹弹窗相关 ====================

/**
 * 打开文件夹弹窗
 */
function openFolderModal (index) {
  if (!folderModal) return;

  currentOpenFolderIndex = index;
  const folder = shortcuts[index];

  if (!isFolder(folder)) return;

  folderNameInput.value = folder.name;
  renderFolderItems(folder.children || []);

  folderModal.classList.add('active');

  // 记录打开时间
  folderOpenTime = Date.now();
  hasEnteredFolderModal = false;
}

/**
 * 关闭文件夹弹窗
 */
export function closeFolderModal () {
  if (!folderModal) return;

  folderModal.classList.remove('active');
  currentOpenFolderIndex = null;

  // 重置管理模式
  isFolderManageMode = false;
  if (folderManageBtn) {
    folderManageBtn.classList.remove('active');
    folderManageBtn.querySelector('span').textContent = '管理';
  }
  if (folderItemsContainer) {
    folderItemsContainer.classList.remove('manage-mode');
  }
}

/**
 * 切换文件夹管理模式
 */
function toggleFolderManageMode () {
  isFolderManageMode = !isFolderManageMode;

  if (isFolderManageMode) {
    folderManageBtn.classList.add('active');
    folderManageBtn.querySelector('span').textContent = '完成';
    folderItemsContainer.classList.add('manage-mode');
  } else {
    folderManageBtn.classList.remove('active');
    folderManageBtn.querySelector('span').textContent = '管理';
    folderItemsContainer.classList.remove('manage-mode');
  }
}

/**
 * 渲染文件夹内的项目
 */
function renderFolderItems (children) {
  if (!folderItemsContainer) return;

  folderItemsContainer.innerHTML = '';

  children.forEach((child, index) => {
    const item = document.createElement('a');
    item.className = 'folder-content-item';
    item.href = child.url || child.target || '#';
    item.dataset.folderItemIndex = index;
    item.draggable = true;

    const iconEl = document.createElement('div');
    iconEl.className = 'folder-content-icon';

    const faviconUrl = getFaviconUrl(child.url || child.target);
    const cached = faviconUrl ? getCachedFavicon(faviconUrl) : null;

    if (cached && cached.status === 'loaded' && cached.blobUrl) {
      const img = document.createElement('img');
      img.src = cached.blobUrl;
      img.alt = child.name;
      iconEl.appendChild(img);
    } else if (faviconUrl) {
      iconEl.textContent = getInitial(child.name);
      loadFaviconAsBlob(faviconUrl).then(result => {
        if (result.status === 'loaded' && result.blobUrl) {
          const img = document.createElement('img');
          img.src = result.blobUrl;
          img.alt = child.name;
          iconEl.textContent = '';
          iconEl.appendChild(img);
        }
      });
    } else {
      iconEl.textContent = getInitial(child.name);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'folder-content-name';
    nameEl.textContent = child.name;

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-content-delete';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>`;
    deleteBtn.title = '移出文件夹';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFolderItem(index);
    });

    item.appendChild(iconEl);
    item.appendChild(nameEl);
    item.appendChild(deleteBtn);

    // 文件夹内拖拽事件
    item.addEventListener('dragstart', handleFolderItemDragStart);
    item.addEventListener('dragend', handleFolderItemDragEnd);
    item.addEventListener('dragover', handleFolderItemDragOver);
    item.addEventListener('dragenter', handleFolderItemDragEnter);
    item.addEventListener('dragleave', handleFolderItemDragLeave);
    item.addEventListener('drop', handleFolderItemDrop);

    folderItemsContainer.appendChild(item);
  });
}

/**
 * 处理文件夹名称变化
 */
function handleFolderNameChange () {
  if (currentOpenFolderIndex === null) return;

  const name = folderNameInput.value.trim();
  if (name && shortcuts[currentOpenFolderIndex]) {
    shortcuts[currentOpenFolderIndex].name = name;
    shortcuts[currentOpenFolderIndex].updatetime = Date.now();
    saveShortcuts();
    render();
  }
}

/**
 * 从文件夹中移除项目
 */
function removeFolderItem (itemIndex) {
  if (currentOpenFolderIndex === null) return;

  const folder = shortcuts[currentOpenFolderIndex];
  if (!isFolder(folder)) return;

  const removedItem = folder.children.splice(itemIndex, 1)[0];

  // 如果文件夹只剩一个或没有项目，将文件夹转为普通项目或删除
  if (folder.children.length === 1) {
    // 文件夹只剩一个项目，将其替换为该项目
    const lastItem = folder.children[0];
    shortcuts[currentOpenFolderIndex] = lastItem;
    closeFolderModal();
  } else if (folder.children.length === 0) {
    // 文件夹为空，删除文件夹
    shortcuts.splice(currentOpenFolderIndex, 1);
    closeFolderModal();
  } else {
    // 更新文件夹内容显示
    renderFolderItems(folder.children);
  }

  // 将移除的项目添加到主列表末尾
  shortcuts.push(removedItem);

  saveShortcuts();
  render();
}

// ==================== 文件夹内拖拽排序（支持拖出文件夹） ====================

let dropOutsideHint = null;

function handleFolderItemDragStart (e) {
  draggedFolderItemIndex = parseInt(e.currentTarget.dataset.folderItemIndex);
  isDraggingFromFolder = true;
  hasEnteredFolderModal = true; // 从文件夹内开始拖拽，说明已经在弹窗内了
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'folder-item');
  e.dataTransfer.setData('application/x-folder-item', draggedFolderItemIndex.toString());

  // 保存被拖拽的项目数据
  if (currentOpenFolderIndex !== null) {
    const folder = shortcuts[currentOpenFolderIndex];
    if (isFolder(folder) && folder.children[draggedFolderItemIndex]) {
      draggedItemData = { ...folder.children[draggedFolderItemIndex] };
    }
  }

  // 显示拖出提示
  showDropOutsideHint();

  // 监听弹窗外的拖拽
  document.addEventListener('dragover', handleDragOverDocument);
}

function handleFolderItemDragEnd (e) {
  // 清除所有拖拽样式
  if (e.currentTarget) {
    e.currentTarget.classList.remove('dragging');
  }
  document.querySelectorAll('.folder-content-item').forEach(item => {
    item.classList.remove('drag-over', 'dragging');
  });
  document.querySelectorAll('.shortcut-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder', 'dragging');
  });

  // 清理计时器
  clearOutsideFolderTimer();

  // 隐藏拖出提示
  hideDropOutsideHint();

  // 移除文档级别的监听
  document.removeEventListener('dragover', handleDragOverDocument);

  // 重置所有拖拽状态
  resetAllDragState();
}

/**
 * 重置所有拖拽状态
 */
function resetAllDragState () {
  draggedFolderItemIndex = null;
  isDraggingFromFolder = false;
  draggedItemData = null;
  hasEnteredFolderModal = false;
  draggedIndex = null;
  draggedElement = null;
  dragOverElement = null;
  dropTargetIndex = null;
  isCreatingFolder = false;
  pendingFolderOpenIndex = null;

  // 清理分页按钮状态
  if (prevPageBtn) prevPageBtn.classList.remove('drag-active', 'drag-highlight');
  if (nextPageBtn) nextPageBtn.classList.remove('drag-active', 'drag-highlight');
}

/**
 * 全局 dragend 处理，确保所有拖拽状态被正确重置
 */
function handleGlobalDragEnd () {
  // 清除所有拖拽样式
  document.querySelectorAll('.shortcut-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder', 'dragging');
  });
  document.querySelectorAll('.folder-content-item').forEach(item => {
    item.classList.remove('drag-over', 'dragging');
  });

  // 清理计时器
  clearAutoPageChange();
  clearDropHoldTimer();
  clearFolderHoverTimer();
  clearOutsideFolderTimer();

  // 隐藏提示
  hideDropOutsideHint();

  // 移除文档级别监听
  document.removeEventListener('dragover', handleDragOverDocument);

  // 重置所有状态
  resetAllDragState();
}

/**
 * 文档级别的 dragover 处理（用于检测拖出文件夹弹窗）
 */
function handleDragOverDocument (e) {
  if (!isDraggingFromFolder || !folderModal || currentOpenFolderIndex === null) return;

  // 检查是否在冷却期内（文件夹刚打开）
  if (Date.now() - folderOpenTime < FOLDER_OPEN_COOLDOWN) {
    return;
  }

  const modalContent = folderModal.querySelector('.modal');
  if (!modalContent) return;

  const rect = modalContent.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;

  // 添加一些边距，避免太敏感
  const padding = 20;
  const isInside = x >= rect.left - padding && x <= rect.right + padding &&
                   y >= rect.top - padding && y <= rect.bottom + padding;

  if (isInside) {
    // 在弹窗内，标记已进入过
    hasEnteredFolderModal = true;
    clearOutsideFolderTimer();
    hideDropOutsideHint();
  } else if (hasEnteredFolderModal) {
    // 只有之前进入过弹窗，才检测拖出
    // 开始计时，准备移出文件夹
    if (!outsideFolderTimer) {
      showDropOutsideHint();
      outsideFolderTimer = setTimeout(() => {
        // 移出文件夹并关闭弹窗，但保持拖拽数据
        extractItemFromFolderAndContinueDrag();
      }, OUTSIDE_FOLDER_DELAY);
    }
  }
}

/**
 * 从文件夹提取项目并继续拖拽
 */
function extractItemFromFolderAndContinueDrag () {
  if (currentOpenFolderIndex === null || draggedFolderItemIndex === null) return;

  const folder = shortcuts[currentOpenFolderIndex];
  if (!isFolder(folder)) return;

  // 移除项目
  const removedItem = folder.children.splice(draggedFolderItemIndex, 1)[0];

  // 将项目添加到主列表末尾
  const newIndex = shortcuts.length;
  shortcuts.push(removedItem);

  // 设置为主列表拖拽状态
  draggedIndex = newIndex;
  draggedItemData = removedItem;

  // 检查文件夹状态并关闭弹窗
  if (folder.children.length === 1) {
    const lastItem = folder.children[0];
    shortcuts[currentOpenFolderIndex] = lastItem;
  } else if (folder.children.length === 0) {
    shortcuts.splice(currentOpenFolderIndex, 1);
    // 调整 draggedIndex
    if (newIndex > currentOpenFolderIndex) {
      draggedIndex = newIndex - 1;
    }
  }

  // 关闭文件夹弹窗
  closeFolderModal();

  // 保存并渲染
  saveShortcuts();
  render();

  // 标记主列表上被拖拽的项目
  setTimeout(() => {
    const items = document.querySelectorAll('.shortcut-item');
    items.forEach(item => {
      if (parseInt(item.dataset.index) === draggedIndex) {
        item.classList.add('dragging');
        draggedElement = item;
      }
    });

    // 显示分页按钮的拖拽状态
    if (totalPages > 1) {
      prevPageBtn.classList.add('drag-active');
      nextPageBtn.classList.add('drag-active');
    }
  }, 50);

  // 隐藏提示
  hideDropOutsideHint();

  // 重置文件夹拖拽状态
  draggedFolderItemIndex = null;
  isDraggingFromFolder = false;
}

/**
 * 清除拖出文件夹计时器
 */
function clearOutsideFolderTimer () {
  if (outsideFolderTimer) {
    clearTimeout(outsideFolderTimer);
    outsideFolderTimer = null;
  }
}

function handleFolderItemDragOver (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleFolderItemDragEnter (e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (parseInt(target.dataset.folderItemIndex) !== draggedFolderItemIndex) {
    target.classList.add('drag-over');
  }
  // 回到弹窗内，取消拖出计时
  clearOutsideFolderTimer();
}

function handleFolderItemDragLeave (e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleFolderItemDrop (e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  target.classList.remove('drag-over');

  // 清除计时器
  clearOutsideFolderTimer();

  if (currentOpenFolderIndex === null) return;

  const folder = shortcuts[currentOpenFolderIndex];
  if (!isFolder(folder)) return;

  const targetIndex = parseInt(target.dataset.folderItemIndex);

  // 如果是从主列表拖入的项目
  if (draggedItemData && draggedFolderItemIndex === null) {
    // 将项目添加到目标位置
    folder.children.splice(targetIndex, 0, draggedItemData);
    folder.updatetime = Date.now();

    draggedItemData = null;
    isCreatingFolder = false;

    saveShortcuts();
    renderFolderItems(folder.children);
    render();
    return;
  }

  // 文件夹内部排序
  if (draggedFolderItemIndex === null) return;
  if (targetIndex === draggedFolderItemIndex) return;

  // 移动项目
  const [movedItem] = folder.children.splice(draggedFolderItemIndex, 1);
  folder.children.splice(targetIndex, 0, movedItem);
  folder.updatetime = Date.now();

  saveShortcuts();
  renderFolderItems(folder.children);
  render();
}

/**
 * 处理拖放到文件夹容器空白区域
 */
function handleFolderContainerDrop (e) {
  e.preventDefault();

  // 如果已经被具体项目处理了，跳过
  if (e.defaultPrevented) return;

  // 清除计时器
  clearOutsideFolderTimer();

  if (currentOpenFolderIndex === null) return;

  const folder = shortcuts[currentOpenFolderIndex];
  if (!isFolder(folder)) return;

  // 如果是从主列表拖入的项目
  if (draggedItemData && draggedFolderItemIndex === null) {
    // 将项目添加到文件夹末尾
    folder.children.push(draggedItemData);
    folder.updatetime = Date.now();

    draggedItemData = null;
    isCreatingFolder = false;

    saveShortcuts();
    renderFolderItems(folder.children);
    render();
  }
}

/**
 * 将项目从文件夹移出（用于点击删除按钮）
 */
function moveItemOutOfFolder (itemIndex) {
  if (currentOpenFolderIndex === null) return;

  const folder = shortcuts[currentOpenFolderIndex];
  if (!isFolder(folder)) return;

  const removedItem = folder.children.splice(itemIndex, 1)[0];

  // 将项目添加到主列表末尾
  shortcuts.push(removedItem);

  // 检查文件夹状态
  if (folder.children.length === 1) {
    const lastItem = folder.children[0];
    shortcuts[currentOpenFolderIndex] = lastItem;
    closeFolderModal();
  } else if (folder.children.length === 0) {
    shortcuts.splice(currentOpenFolderIndex, 1);
    closeFolderModal();
  } else {
    renderFolderItems(folder.children);
  }

  saveShortcuts();
  render();
}

/**
 * 显示拖出文件夹的提示
 */
function showDropOutsideHint () {
  if (!dropOutsideHint) {
    dropOutsideHint = document.createElement('div');
    dropOutsideHint.className = 'folder-drop-outside-hint';
    dropOutsideHint.textContent = '💡 拖到弹窗外松开，可移出文件夹';
    document.body.appendChild(dropOutsideHint);
  }
  dropOutsideHint.classList.add('visible');
}

/**
 * 隐藏拖出文件夹的提示
 */
function hideDropOutsideHint () {
  if (dropOutsideHint) {
    dropOutsideHint.classList.remove('visible');
  }
}

// ==================== 主列表拖拽排序（支持创建文件夹和自动打开文件夹） ====================

let dropHoldTimer = null;
const DROP_HOLD_DELAY = 400; // 悬停创建文件夹的延迟
let pendingFolderOpenIndex = null; // 待打开的文件夹索引

function handleDragStart (e) {
  draggedIndex = parseInt(e.currentTarget.dataset.index);
  draggedElement = e.currentTarget;

  // 保存被拖拽的项目数据
  draggedItemData = { ...shortcuts[draggedIndex] };

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedIndex);

  setTimeout(() => {
    draggedElement.classList.add('dragging');
  }, 0);

  if (totalPages > 1) {
    prevPageBtn.classList.add('drag-active');
    nextPageBtn.classList.add('drag-active');
  }
}

function handleDragEnd (e) {
  // 清除所有拖拽样式
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
  }

  document.querySelectorAll('.shortcut-item').forEach(item => {
    item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder', 'dragging');
  });
  document.querySelectorAll('.folder-content-item').forEach(item => {
    item.classList.remove('drag-over', 'dragging');
  });

  prevPageBtn.classList.remove('drag-active', 'drag-highlight');
  nextPageBtn.classList.remove('drag-active', 'drag-highlight');

  clearAutoPageChange();
  clearDropHoldTimer();
  clearFolderHoverTimer();
  clearOutsideFolderTimer();
  hideDropOutsideHint();

  // 移除文档级别监听
  document.removeEventListener('dragover', handleDragOverDocument);

  // 重置所有状态
  resetAllDragState();
}

function handleDragOver (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  checkAutoPageChange(e.clientX);
}

function handleDragEnter (e) {
  e.preventDefault();
  const target = e.currentTarget;

  if (target === draggedElement) return;
  if (target.classList.contains('add-shortcut-btn')) return;

  document.querySelectorAll('.shortcut-item').forEach(item => {
    if (item !== target) {
      item.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder');
    }
  });

  const targetIndex = parseInt(target.dataset.index);
  dropTargetIndex = targetIndex;

  const draggedItem = draggedIndex !== null ? shortcuts[draggedIndex] : draggedItemData;
  const targetItem = shortcuts[targetIndex];

  // 清除之前的计时器
  clearDropHoldTimer();
  clearFolderHoverTimer();

  // 如果目标是文件夹，且拖拽的不是文件夹
  if (isFolder(targetItem) && !isFolder(draggedItem)) {
    target.classList.add('drag-over-folder');
    // 悬停一段时间后自动打开文件夹
    pendingFolderOpenIndex = targetIndex;
    folderHoverTimer = setTimeout(() => {
      openFolderForDrop(targetIndex);
    }, FOLDER_HOVER_DELAY);
  } else if (draggedItem && !isFolder(draggedItem) && !isFolder(targetItem)) {
    // 两个普通项目（都不是文件夹），悬停后创建文件夹
    dropHoldTimer = setTimeout(() => {
      target.classList.add('drag-over-merge');
      isCreatingFolder = true;
      // 直接创建文件夹并打开
      createFolderAndOpenForDrop(draggedIndex, targetIndex);
    }, DROP_HOLD_DELAY);
  }

  // 显示位置指示器
  if (draggedIndex !== null && targetIndex < draggedIndex) {
    target.classList.add('drag-over', 'drag-over-left');
  } else {
    target.classList.add('drag-over', 'drag-over-right');
  }

  dragOverElement = target;
}

function handleDragLeave (e) {
  const target = e.currentTarget;
  if (!target.contains(e.relatedTarget)) {
    target.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder');
    clearDropHoldTimer();
    clearFolderHoverTimer();
    isCreatingFolder = false;
    pendingFolderOpenIndex = null;
  }
}

function handleDrop (e) {
  e.preventDefault();

  const target = e.currentTarget;
  if (target === draggedElement) return;
  if (target.classList.contains('add-shortcut-btn')) return;

  const targetIndex = parseInt(target.dataset.index);

  clearDropHoldTimer();
  clearFolderHoverTimer();

  if (draggedIndex !== null && targetIndex !== draggedIndex) {
    const draggedItem = shortcuts[draggedIndex];
    const targetItem = shortcuts[targetIndex];

    // 检查是否要合并为文件夹（文件夹不参与合并，只能移动）
    if (isCreatingFolder || target.classList.contains('drag-over-merge')) {
      if (isFolder(targetItem) && !isFolder(draggedItem)) {
        // 普通项目拖入已有文件夹
        addToFolder(draggedIndex, targetIndex);
      } else if (!isFolder(draggedItem) && !isFolder(targetItem)) {
        // 两个普通项目合并为新文件夹
        createNewFolder(draggedIndex, targetIndex);
      }
    } else {
      // 普通移动
      moveShortcut(draggedIndex, targetIndex);
    }
  }

  target.classList.remove('drag-over', 'drag-over-left', 'drag-over-right', 'drag-over-merge', 'drag-over-folder');
  isCreatingFolder = false;
  pendingFolderOpenIndex = null;
}

/**
 * 清除悬停计时器
 */
function clearDropHoldTimer () {
  if (dropHoldTimer) {
    clearTimeout(dropHoldTimer);
    dropHoldTimer = null;
  }
}

/**
 * 清除文件夹悬停计时器
 */
function clearFolderHoverTimer () {
  if (folderHoverTimer) {
    clearTimeout(folderHoverTimer);
    folderHoverTimer = null;
  }
}

/**
 * 打开文件夹用于拖放
 */
function openFolderForDrop (folderIndex) {
  if (draggedIndex === null && !draggedItemData) return;

  const folder = shortcuts[folderIndex];
  if (!isFolder(folder)) return;

  // 先将被拖拽的项目添加到文件夹末尾
  const draggedItem = draggedIndex !== null ? shortcuts[draggedIndex] : draggedItemData;

  if (isFolder(draggedItem)) {
    // 如果拖拽的是文件夹，合并其子项
    folder.children.push(...draggedItem.children);
  } else {
    folder.children.push({ ...draggedItem });
  }

  // 从主列表中移除被拖拽的项目
  if (draggedIndex !== null) {
    shortcuts.splice(draggedIndex, 1);
    // 调整文件夹索引
    if (draggedIndex < folderIndex) {
      folderIndex--;
    }
  }

  folder.updatetime = Date.now();

  // 保存
  saveShortcuts();
  render();

  // 打开文件夹弹窗
  currentOpenFolderIndex = folderIndex;
  folderNameInput.value = folder.name;
  renderFolderItems(folder.children);
  folderModal.classList.add('active');

  // 记录文件夹打开时间，用于冷却期判断
  folderOpenTime = Date.now();
  hasEnteredFolderModal = false; // 重置，需要重新进入弹窗

  // 标记最后添加的项目为拖拽状态
  const newItemIndex = folder.children.length - 1;
  draggedFolderItemIndex = newItemIndex;
  isDraggingFromFolder = true;

  setTimeout(() => {
    const items = folderItemsContainer.querySelectorAll('.folder-content-item');
    if (items[newItemIndex]) {
      items[newItemIndex].classList.add('dragging');
    }
    // 监听文档拖拽
    document.addEventListener('dragover', handleDragOverDocument);
  }, 50);

  // 重置主列表拖拽状态
  draggedIndex = null;
  draggedElement = null;
  pendingFolderOpenIndex = null;
}

/**
 * 将项目添加到文件夹
 */
function addToFolder (itemIndex, folderIndex) {
  const item = shortcuts[itemIndex];
  const folder = shortcuts[folderIndex];

  if (!isFolder(folder)) return;

  // 如果拖入的是文件夹，将其子项目合并
  if (isFolder(item)) {
    folder.children.push(...item.children);
  } else {
    folder.children.push(item);
  }

  folder.updatetime = Date.now();

  // 删除原项目
  shortcuts.splice(itemIndex, 1);

  saveShortcuts();
  render();
}

/**
 * 创建新文件夹（只支持两个普通项目）
 */
function createNewFolder (index1, index2) {
  // 确保 index1 < index2，方便处理
  if (index1 > index2) {
    [index1, index2] = [index2, index1];
  }

  const item1 = shortcuts[index1];
  const item2 = shortcuts[index2];

  // 文件夹不参与合并
  if (isFolder(item1) || isFolder(item2)) return;

  // 创建文件夹
  const folder = createFolder('新文件夹', [item1, item2]);

  // 移除原项目（先移除后面的，避免索引变化）
  shortcuts.splice(index2, 1);
  shortcuts.splice(index1, 1);

  // 在较小索引位置插入文件夹
  shortcuts.splice(index1, 0, folder);

  saveShortcuts();
  render();

  // 立即打开文件夹
  openFolderModal(index1);
}

/**
 * 拖拽时创建文件夹并打开（两个普通项目都放进去）
 */
function createFolderAndOpenForDrop (dragIndex, targetIndex) {
  if (dragIndex === null || dragIndex === targetIndex) return;

  const draggedItem = shortcuts[dragIndex];
  const targetItem = shortcuts[targetIndex];

  // 文件夹不参与合并
  if (isFolder(draggedItem) || isFolder(targetItem)) return;

  // 创建包含两个项目的文件夹（目标项目在前，被拖拽的在后）
  const folder = createFolder('新文件夹', [targetItem, draggedItem]);

  // 确保先移除后面的索引
  if (dragIndex > targetIndex) {
    shortcuts.splice(dragIndex, 1);
    shortcuts.splice(targetIndex, 1);
  } else {
    shortcuts.splice(targetIndex, 1);
    shortcuts.splice(dragIndex, 1);
  }

  // 计算文件夹应该插入的位置
  const folderIndex = Math.min(dragIndex, targetIndex);
  shortcuts.splice(folderIndex, 0, folder);

  // 清除主列表拖拽状态
  draggedIndex = null;
  isCreatingFolder = false;

  saveShortcuts();
  render();

  // 打开文件夹弹窗
  currentOpenFolderIndex = folderIndex;
  folderNameInput.value = folder.name;
  renderFolderItems(folder.children);
  folderModal.classList.add('active');

  // 记录文件夹打开时间，用于冷却期判断
  folderOpenTime = Date.now();
  hasEnteredFolderModal = false; // 重置，需要重新进入弹窗

  // 标记被拖拽的项目（最后一个，即原来被拖拽的那个）为拖拽状态
  const newItemIndex = folder.children.length - 1;
  draggedFolderItemIndex = newItemIndex;
  isDraggingFromFolder = true;
  draggedItemData = { ...folder.children[newItemIndex] };

  setTimeout(() => {
    const items = folderItemsContainer.querySelectorAll('.folder-content-item');
    if (items[newItemIndex]) {
      items[newItemIndex].classList.add('dragging');
    }
    // 监听文档拖拽，用于检测拖出弹窗
    document.addEventListener('dragover', handleDragOverDocument);
  }, 50);
}

/**
 * 移动快捷方式
 */
function moveShortcut (fromIndex, toIndex) {
  const [movedItem] = shortcuts.splice(fromIndex, 1);
  shortcuts.splice(toIndex, 0, movedItem);

  saveShortcuts();
  render();
}

/**
 * 检查是否需要自动翻页
 */
function checkAutoPageChange (clientX) {
  if (totalPages <= 1) return;

  const containerRect = shortcutsContainer.getBoundingClientRect();
  const edgeThreshold = 60;

  if (clientX < containerRect.left + edgeThreshold && currentPage > 0) {
    startAutoPageChange(-1);
  } else if (clientX > containerRect.right - edgeThreshold && currentPage < totalPages - 1) {
    startAutoPageChange(1);
  } else {
    clearAutoPageChange();
  }
}

function startAutoPageChange (direction) {
  if (autoPageChangeTimer) return;

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

function clearAutoPageChange () {
  if (autoPageChangeTimer) {
    clearTimeout(autoPageChangeTimer);
    autoPageChangeTimer = null;
  }
  prevPageBtn.classList.remove('drag-highlight');
  nextPageBtn.classList.remove('drag-highlight');
}

function setupPageBtnDragEvents (btn, direction) {
  let pageChangeTimer = null;
  let lastPageChangeTime = 0;
  const PAGE_CHANGE_COOLDOWN = 400;

  btn.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const targetPage = currentPage + direction;
    if (targetPage < 0 || targetPage >= totalPages) return;

    btn.classList.add('drag-highlight');

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

// ==================== 导入导出相关 ====================

/**
 * 检查 URL 是否已存在（检查所有地方：主列表 + 所有文件夹内）
 */
function isUrlExists (url) {
  if (!url) return false;
  
  for (const item of shortcuts) {
    if (isFolder(item)) {
      // 检查文件夹内的子项
      if (item.children && item.children.some(c => (c.url || c.target) === url)) {
        return true;
      }
    } else {
      // 检查主列表的普通项目
      if ((item.url || item.target) === url) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 批量导入快捷方式
 */
export function importShortcuts (items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  let importCount = 0;
  items.forEach(item => {
    if (item.name && (item.url || item.target)) {
      const url = item.url || item.target;
      if (!isUrlExists(url)) {
        shortcuts.push({
          name: item.name,
          url: url
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
 * 解析 Infinity 备份文件并导入（支持文件夹）
 */
export function parseAndImportInfinityBackup (data) {
  try {
    // 检查是否是本插件导出的格式
    if (data && data.type === 'simpleNewTab' && Array.isArray(data.shortcuts)) {
      const importCount = importShortcutsWithFolders(data.shortcuts);
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
    const importItems = [];

    // 遍历二维数组，提取项目（包括文件夹）
    sites.forEach(page => {
      if (Array.isArray(page)) {
        page.forEach(site => {
          // 检查是否是文件夹（uuid 以 folder- 开头）
          if (site.uuid && site.uuid.startsWith('folder-') && Array.isArray(site.children)) {
            // 这是一个文件夹
            const folder = createFolder(site.name, []);
            site.children.forEach(child => {
              // 只导入 web 类型的项目，过滤掉 infinity:// 等特殊协议
              if (child.name && child.target && child.type === 'web' && !child.target.startsWith('infinity://')) {
                folder.children.push({
                  name: child.name,
                  url: child.target
                });
              }
            });
            if (folder.children.length > 0) {
              importItems.push(folder);
            }
          } else if (site.type === 'web' && site.target && site.name && !site.target.startsWith('infinity://')) {
            // 普通网页快捷方式，过滤掉特殊协议
            importItems.push({
              name: site.name,
              url: site.target
            });
          }
        });
      }
    });

    if (importItems.length === 0) {
      return { success: false, count: 0, message: '未找到可导入的网页快捷方式' };
    }

    const importCount = importShortcutsWithFolders(importItems);

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
 * 导入快捷方式（支持文件夹）
 */
function importShortcutsWithFolders (items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  let importCount = 0;

  items.forEach(item => {
    if (isFolder(item)) {
      // 文件夹
      if (item.children && item.children.length > 0) {
        // 检查是否有重复的文件夹（通过名称）
        const existingFolder = shortcuts.find(s => isFolder(s) && s.name === item.name);
        if (existingFolder) {
          // 合并到现有文件夹
          item.children.forEach(child => {
            const childUrl = child.url || child.target;
            // 使用完整检查：检查所有地方是否已存在此 URL
            if (!isUrlExists(childUrl)) {
              existingFolder.children.push({
                name: child.name,
                url: childUrl
              });
              importCount++;
            }
          });
          existingFolder.updatetime = Date.now();
        } else {
          // 添加新文件夹 - 深拷贝并过滤已存在的 URL
          const newFolder = createFolder(item.name, []);
          item.children.forEach(child => {
            const childUrl = child.url || child.target;
            // 使用完整检查：检查所有地方是否已存在此 URL
            if (!isUrlExists(childUrl)) {
              newFolder.children.push({
                name: child.name,
                url: childUrl
              });
              importCount++;
            }
          });
          // 只有当文件夹内有项目时才添加
          if (newFolder.children.length > 0) {
            shortcuts.push(newFolder);
          }
        }
      }
    } else if (item.name && (item.url || item.target)) {
      // 普通项目 - 使用完整检查
      const url = item.url || item.target;
      if (!isUrlExists(url)) {
        shortcuts.push({
          name: item.name,
          url: url
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
 * 导出所有快捷方式
 */
export function exportShortcuts () {
  // 使用深拷贝，避免文件夹的 children 数组仍然是引用
  return {
    type: 'simpleNewTab',
    version: '1.0',
    exportTime: new Date().toISOString(),
    shortcuts: JSON.parse(JSON.stringify(shortcuts))
  };
}

/**
 * 获取快捷方式数量
 */
export function getShortcutsCount () {
  let count = 0;
  shortcuts.forEach(item => {
    if (isFolder(item)) {
      count += item.children.length;
    } else {
      count++;
    }
  });
  return count;
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
