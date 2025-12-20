document.addEventListener('DOMContentLoaded', () => {
  const reader = new NovelReader();
  
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const closeSidebar = document.getElementById('close-sidebar');
  const overlay = document.getElementById('overlay');
  const readingModeBtn = document.getElementById('reading-mode-btn');
  const themeBtn = document.getElementById('theme-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettings = document.getElementById('close-settings');
  const fontDecrease = document.getElementById('font-decrease');
  const fontIncrease = document.getElementById('font-increase');
  const fontSizeDisplay = document.getElementById('font-size-display');
  const lineHeightInput = document.getElementById('line-height');
  const fontFamilySelect = document.getElementById('font-family');
  const toc = document.getElementById('toc');
  const book = document.getElementById('book');
  const header = document.getElementById('header');
  const novelUrl = document.getElementById('novel-url');
  const loadBtn = document.getElementById('load-btn');
  const navPrev = document.getElementById('nav-prev');
  const navNext = document.getElementById('nav-next');
  const app = document.getElementById('app');

  let settings = Settings.get();
  let headerTimeout;
  
  // 初期設定適用
  applyTheme(settings.theme);
  updateReadingModeBtn(settings.readingMode);
  fontSizeDisplay.textContent = `${settings.fontSize}px`;
  lineHeightInput.value = settings.lineHeight;
  fontFamilySelect.value = settings.fontFamily;
  reader.applySettings();

  // 小説読み込み
  loadBtn.addEventListener('click', () => {
    if (novelUrl.value.trim()) reader.loadFromNarou(novelUrl.value);
  });
  novelUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && novelUrl.value.trim()) reader.loadFromNarou(novelUrl.value);
  });

  // サイドバー
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('visible');
    overlay.classList.remove('hidden');
  });

  function closeSidebarFn() {
    sidebar.classList.remove('visible');
    overlay.classList.add('hidden');
  }
  
  closeSidebar.addEventListener('click', closeSidebarFn);
  overlay.addEventListener('click', () => {
    closeSidebarFn();
    closeSettingsFn();
  });

  // 目次
  toc.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      reader.goToChapter(parseInt(e.target.dataset.chapter));
      closeSidebarFn();
    }
  });

  // 読書モード
  readingModeBtn.addEventListener('click', () => {
    const newMode = reader.settings.readingMode === 'vertical' ? 'horizontal' : 'vertical';
    reader.setReadingMode(newMode);
    updateReadingModeBtn(newMode);
  });

  function updateReadingModeBtn(mode) {
    readingModeBtn.textContent = mode === 'vertical' ? '横' : '縦';
    readingModeBtn.title = mode === 'vertical' ? '横書きに切替' : '縦書きに切替';
  }

  // テーマ
  themeBtn.addEventListener('click', () => {
    settings = Settings.get();
    const newTheme = Settings.nextTheme(settings.theme);
    Settings.update('theme', newTheme);
    applyTheme(newTheme);
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = Settings.getThemeIcon(theme);
  }

  // 全画面
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  
  function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
      app.classList.add('fullscreen');
      fullscreenBtn.textContent = '⛶';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      app.classList.remove('fullscreen');
      fullscreenBtn.textContent = '⛶';
    }
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      app.classList.remove('fullscreen');
    }
  });

  // 全画面時のヘッダー表示
  document.addEventListener('mousemove', (e) => {
    if (app.classList.contains('fullscreen')) {
      if (e.clientY < 60) {
        header.classList.add('show-header');
        clearTimeout(headerTimeout);
      } else {
        headerTimeout = setTimeout(() => {
          header.classList.remove('show-header');
        }, 2000);
      }
    }
  });

  // 設定パネル
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('visible');
    overlay.classList.remove('hidden');
  });

  function closeSettingsFn() {
    settingsPanel.classList.remove('visible');
    overlay.classList.add('hidden');
  }
  
  closeSettings.addEventListener('click', closeSettingsFn);

  // フォントサイズ
  fontDecrease.addEventListener('click', () => {
    const newSize = Math.max(12, reader.settings.fontSize - 2);
    reader.setFontSize(newSize);
    fontSizeDisplay.textContent = `${newSize}px`;
  });
  fontIncrease.addEventListener('click', () => {
    const newSize = Math.min(28, reader.settings.fontSize + 2);
    reader.setFontSize(newSize);
    fontSizeDisplay.textContent = `${newSize}px`;
  });

  // 行間
  lineHeightInput.addEventListener('input', (e) => {
    reader.setLineHeight(parseFloat(e.target.value));
  });

  // フォント
  fontFamilySelect.addEventListener('change', (e) => {
    reader.setFontFamily(e.target.value);
  });

  // ページナビ（タップ）
  navPrev.addEventListener('click', () => {
    const isVertical = reader.settings.readingMode === 'vertical';
    isVertical ? reader.nextPage() : reader.prevPage();
  });
  navNext.addEventListener('click', () => {
    const isVertical = reader.settings.readingMode === 'vertical';
    isVertical ? reader.prevPage() : reader.nextPage();
  });

  // キーボード
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const isVertical = reader.settings.readingMode === 'vertical';
    
    switch (e.key) {
      case 'ArrowRight':
        isVertical ? reader.prevPage() : reader.nextPage();
        break;
      case 'ArrowLeft':
        isVertical ? reader.nextPage() : reader.prevPage();
        break;
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        reader.nextPage();
        break;
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        reader.prevPage();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'Escape':
        if (app.classList.contains('fullscreen')) {
          app.classList.remove('fullscreen');
        }
        break;
    }
  });

  // タッチ（スワイプ）
  book.addEventListener('touchstart', (e) => reader.handleTouchStart(e), { passive: true });
  book.addEventListener('touchend', (e) => reader.handleTouchEnd(e), { passive: true });

  // ダブルタップで全画面（スマホ用）
  let lastTap = 0;
  book.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      toggleFullscreen();
    }
    lastTap = now;
  });

  // リサイズ
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => reader.onResize(), 200);
  });

  // 画面回転
  window.addEventListener('orientationchange', () => {
    setTimeout(() => reader.onResize(), 300);
  });
});
