// 設定管理
const Settings = {
  defaults: {
    fontSize: 18,
    lineHeight: 2,
    fontFamily: "'Noto Serif JP', serif",
    theme: 'sepia',  // デフォルトをセピアに
    readingMode: 'horizontal',
    progress: {}
  },

  themes: ['sepia', 'white', 'dark'],  // テーマの順番

  get() {
    const saved = localStorage.getItem('novelViewerSettings');
    return saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
  },

  save(settings) {
    localStorage.setItem('novelViewerSettings', JSON.stringify(settings));
  },

  update(key, value) {
    const settings = this.get();
    settings[key] = value;
    this.save(settings);
    return settings;
  },

  saveProgress(novelId, chapterIndex, scrollPosition) {
    const settings = this.get();
    settings.progress[novelId] = { chapterIndex, scrollPosition };
    this.save(settings);
  },

  getProgress(novelId) {
    const settings = this.get();
    return settings.progress[novelId] || { chapterIndex: 0, scrollPosition: 0 };
  },

  nextTheme(currentTheme) {
    const idx = this.themes.indexOf(currentTheme);
    return this.themes[(idx + 1) % this.themes.length];
  },

  getThemeIcon(theme) {
    switch (theme) {
      case 'sepia': return '📖';   // 本（セピア/黄ばみ）
      case 'white': return '☀️';   // 太陽（ホワイト）
      case 'dark': return '🌙';    // 月（ダーク）
      default: return '📖';
    }
  },

  getThemeName(theme) {
    switch (theme) {
      case 'sepia': return 'セピア';
      case 'white': return 'ホワイト';
      case 'dark': return 'ダーク';
      default: return theme;
    }
  }
};
