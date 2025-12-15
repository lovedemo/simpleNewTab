/**
 * 主入口文件
 */

import * as Time from './time.js';
import * as Settings from './settings.js';
import * as Search from './search.js';
import * as Shortcuts from './shortcuts.js';
import * as Wallpaper from './wallpaper.js';

/**
 * 初始化应用
 */
async function init () {
  // 先初始化设置模块（其他模块依赖它）
  await Settings.init();

  // 初始化各模块
  Time.init();
  await Search.init();
  await Shortcuts.init();
  await Wallpaper.init();

  // 全局 ESC 键处理
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Shortcuts.closeModal();
      Shortcuts.hideContextMenu();
      Wallpaper.closeModal();
      Settings.closeModal();
    }
  });
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
