/**
 * Favicon 工具模块 - 处理网站图标加载
 */

// Favicon 缓存（使用 Blob URL）
const faviconCache = new Map(); // url -> { status: 'loaded' | 'failed' | 'loading', blobUrl?: string }

/**
 * 获取网站图标 URL
 */
export function getFaviconUrl(url) {
  try {
    const urlObj = new URL(url);
    const siteUrl = urlObj.origin;
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(siteUrl)}&size=64`;
  } catch {
    return null;
  }
}

/**
 * 获取名称前两个字符作为图标文字
 */
export function getInitial(name) {
  // 去除空格，取前两个字符
  const cleanName = name.replace(/\s+/g, '');
  if (cleanName.length >= 2) {
    return cleanName.substring(0, 2);
  }
  return cleanName.charAt(0).toUpperCase();
}

/**
 * 使用 fetch 加载 favicon 并转换为 Blob URL
 */
export async function loadFaviconAsBlob(url) {
  // 检查缓存
  const cached = faviconCache.get(url);
  if (cached) {
    return cached;
  }

  // 标记为加载中
  faviconCache.set(url, { status: 'loading' });

  try {
    const response = await fetch(url);

    // 检查响应状态
    if (!response.ok) {
      faviconCache.set(url, { status: 'failed' });
      return { status: 'failed' };
    }

    // 检查内容类型是否为图片
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      faviconCache.set(url, { status: 'failed' });
      return { status: 'failed' };
    }

    // 转换为 Blob
    const blob = await response.blob();

    // 检查 Blob 大小（太小可能是无效图标）
    if (blob.size < 100) {
      faviconCache.set(url, { status: 'failed' });
      return { status: 'failed' };
    }

    // 创建 Blob URL
    const blobUrl = URL.createObjectURL(blob);
    const result = { status: 'loaded', blobUrl };
    faviconCache.set(url, result);
    return result;
  } catch (e) {
    faviconCache.set(url, { status: 'failed' });
    return { status: 'failed' };
  }
}

/**
 * 获取缓存状态
 */
export function getCachedFavicon(url) {
  return faviconCache.get(url);
}

/**
 * 为元素设置 favicon 图标
 * @param {HTMLElement} iconEl - 图标容器元素
 * @param {string} url - 网站 URL
 * @param {string} name - 网站名称（用于回退显示）
 */
export async function setFaviconForElement(iconEl, url, name) {
  const faviconUrl = getFaviconUrl(url);
  
  if (!faviconUrl) {
    iconEl.textContent = getInitial(name);
    return;
  }
  
  const cached = faviconCache.get(faviconUrl);
  
  // 根据缓存状态决定显示方式
  if (cached && cached.status === 'loaded' && cached.blobUrl) {
    // 已缓存且成功，直接显示图片
    const img = document.createElement('img');
    img.src = cached.blobUrl;
    img.alt = name;
    iconEl.innerHTML = '';
    iconEl.appendChild(img);
  } else if (cached && cached.status === 'failed') {
    // 已缓存且失败，显示文字
    iconEl.textContent = getInitial(name);
  } else {
    // 未缓存或加载中，先显示文字，然后尝试加载
    iconEl.textContent = getInitial(name);

    // 异步加载 favicon
    const result = await loadFaviconAsBlob(faviconUrl);
    if (result.status === 'loaded' && result.blobUrl) {
      // 加载成功，替换为图片
      const img = document.createElement('img');
      img.src = result.blobUrl;
      img.alt = name;
      iconEl.textContent = '';
      iconEl.appendChild(img);
    }
    // 失败则保持文字图标
  }
}

