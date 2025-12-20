const Settings = {
  defaults: {
    fontSize: 18,
    lineHeight: 1.8,
    fontFamily: "'Noto Serif JP', serif",
    theme: 'white',
    readingMode: 'vertical',
    progress: {},
    history: []
  },

  themes: ['white', 'sepia', 'dark'],
  maxHistory: 20,

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

  saveProgress(novelId, chapterIndex, pageIndex) {
    const settings = this.get();
    settings.progress[novelId] = { chapterIndex, pageIndex };
    this.save(settings);
  },

  getProgress(novelId) {
    const settings = this.get();
    return settings.progress[novelId] || { chapterIndex: 0, pageIndex: 0 };
  },

  addHistory(novelId, title, author) {
    const settings = this.get();
    if (!settings.history) settings.history = [];
    
    // 既存の同じ小説を削除
    settings.history = settings.history.filter(h => h.id !== novelId);
    
    // 先頭に追加
    settings.history.unshift({
      id: novelId,
      title: title,
      author: author,
      lastRead: Date.now()
    });
    
    // 最大数を超えたら古いものを削除
    if (settings.history.length > this.maxHistory) {
      settings.history = settings.history.slice(0, this.maxHistory);
    }
    
    this.save(settings);
  },

  getHistory() {
    const settings = this.get();
    return settings.history || [];
  },

  removeHistory(novelId) {
    const settings = this.get();
    if (!settings.history) return;
    settings.history = settings.history.filter(h => h.id !== novelId);
    delete settings.progress[novelId];
    this.save(settings);
  },

  nextTheme(current) {
    const idx = this.themes.indexOf(current);
    return this.themes[(idx + 1) % this.themes.length];
  },

  getThemeIcon(theme) {
    return { white: '☀️', sepia: '📖', dark: '🌙' }[theme] || '☀️';
  }
};
