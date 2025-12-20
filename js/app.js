// メインアプリケーション
document.addEventListener('DOMContentLoaded', () => {
  const reader = new NovelReader();
  
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const closeSidebar = document.getElementById('close-sidebar');
  const overlay = document.getElementById('overlay');
  const readingModeBtn = document.getElementById('reading-mode-btn');
  const themeBtn = document.getElementById('theme-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettings = document.getElementById('close-settings');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const fontDecrease = document.getElementById('font-decrease');
  const fontIncrease = document.getElementById('font-increase');
  const fontSizeDisplay = document.getElementById('font-size-display');
  const lineHeightInput = document.getElementById('line-height');
  const fontFamilySelect = document.getElementById('font-family');
  const toc = document.getElementById('toc');
  const readerEl = document.getElementById('reader');
  const novelUrl = document.getElementById('novel-url');
  const loadBtn = document.getElementById('load-btn');

  // 初期設定を適用
  let settings = Settings.get();
  applyTheme(settings.theme);
  updateReadingModeBtn(settings.readingMode);
  fontSizeDisplay.textContent = `${settings.fontSize}px`;
  lineHeightInput.value = settings.lineHeight;
  fontFamilySelect.value = settings.fontFamily;
  reader.applySettings();

  // 小説読み込み
  loadBtn.addEventListener('click', () => {
    const input = novelUrl.value.trim();
    if (input) {
      reader.loadFromNarou(input);
    }
  });

  novelUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const input = novelUrl.value.trim();
      if (input) {
        reader.loadFromNarou(input);
      }
    }
  });

  // サイドバー（目次）
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('visible');
    overlay.classList.remove('hidden');
    
    // 現在の章にスクロール
    setTimeout(() => {
      const activeItem = toc.querySelector('a.active');
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'center' });
      }
    }, 100);
  });

  closeSidebar.addEventListener('click', closeSidebarFn);
  overlay.addEventListener('click', () => {
    closeSidebarFn();
    closeSettingsFn();
  });

  function closeSidebarFn() {
    sidebar.classList.remove('visible');
    overlay.classList.add('hidden');
  }

  // 目次クリック
  toc.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      e.preventDefault();
      const chapter = parseInt(e.target.dataset.chapter);
      reader.goToChapter(chapter);
      closeSidebarFn();
    }
  });

  // 読書モード切替
  readingModeBtn.addEventListener('click', () => {
    const newMode = reader.settings.readingMode === 'horizontal' ? 'vertical' : 'horizontal';
    reader.setReadingMode(newMode);
    updateReadingModeBtn(newMode);
  });

  function updateReadingModeBtn(mode) {
    readingModeBtn.textContent = mode === 'horizontal' ? '縦' : '横';
    readingModeBtn.title = mode === 'horizontal' ? '縦書きに切替' : '横書きに切替';
  }

  // テーマ切替（3つのテーマをサイクル）
  themeBtn.addEventListener('click', () => {
    settings = Settings.get();
    const newTheme = Settings.nextTheme(settings.theme);
    settings.theme = newTheme;
    Settings.update('theme', newTheme);
    applyTheme(newTheme);
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.querySelector('.theme-icon').textContent = Settings.getThemeIcon(theme);
    themeBtn.title = `テーマ: ${Settings.getThemeName(theme)}`;
  }

  // 設定パネル
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    overlay.classList.remove('hidden');
  });

  closeSettings.addEventListener('click', closeSettingsFn);

  function closeSettingsFn() {
    settingsPanel.classList.add('hidden');
    overlay.classList.add('hidden');
  }

  // フォントサイズ
  fontDecrease.addEventListener('click', () => {
    const newSize = Math.max(12, reader.settings.fontSize - 2);
    reader.setFontSize(newSize);
    fontSizeDisplay.textContent = `${newSize}px`;
  });

  fontIncrease.addEventListener('click', () => {
    const newSize = Math.min(32, reader.settings.fontSize + 2);
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

  // ページ送り
  prevBtn.addEventListener('click', () => reader.prevPage());
  nextBtn.addEventListener('click', () => reader.nextPage());

  // キーボード操作
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    switch (e.key) {
      case 'ArrowRight':
        reader.settings.readingMode === 'vertical' ? reader.prevPage() : reader.nextPage();
        break;
      case 'ArrowLeft':
        reader.settings.readingMode === 'vertical' ? reader.nextPage() : reader.prevPage();
        break;
      case 'ArrowDown':
        reader.nextPage();
        break;
      case 'ArrowUp':
        reader.prevPage();
        break;
      case 'PageDown':
      case ' ':
        e.preventDefault();
        reader.nextPage();
        break;
      case 'PageUp':
        e.preventDefault();
        reader.prevPage();
        break;
    }
  });

  // タッチ操作
  readerEl.addEventListener('touchstart', (e) => reader.handleTouchStart(e), { passive: true });
  readerEl.addEventListener('touchend', (e) => reader.handleTouchEnd(e), { passive: true });

  // リサイズ時にページ数を更新
  window.addEventListener('resize', () => {
    setTimeout(() => reader.updatePageIndicator(), 100);
  });
});
