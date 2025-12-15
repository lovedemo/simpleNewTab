/**
 * 时间模块 - 处理时钟、日期、问候语
 */

let timeEl, dateEl, greetingEl;

/**
 * 初始化时间模块
 */
export function init() {
  timeEl = document.getElementById('time');
  dateEl = document.getElementById('date');
  greetingEl = document.getElementById('greeting');

  updateTime();
  updateDate();
  updateGreeting();

  // 每秒更新时间
  setInterval(updateTime, 1000);
  // 每分钟更新日期和问候语
  setInterval(updateDate, 60000);
  setInterval(updateGreeting, 60000);
}

/**
 * 更新时间显示
 */
function updateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  timeEl.textContent = `${hours}:${minutes}`;
}

/**
 * 更新日期显示
 */
function updateDate() {
  const now = new Date();
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  };
  dateEl.textContent = now.toLocaleDateString('zh-CN', options);
}

/**
 * 更新问候语
 */
function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = '';

  if (hour >= 5 && hour < 12) {
    greeting = '早上好 ☀️';
  } else if (hour >= 12 && hour < 14) {
    greeting = '中午好 🌤️';
  } else if (hour >= 14 && hour < 18) {
    greeting = '下午好 🌅';
  } else if (hour >= 18 && hour < 22) {
    greeting = '晚上好 🌙';
  } else {
    greeting = '夜深了，注意休息 ✨';
  }

  greetingEl.textContent = greeting;
}


