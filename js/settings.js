const Settings = {
  defaults: {
    fontSize: 18,
    lineHeight: 1.8,
    fontFamily: "'Noto Serif JP', serif",
    theme: 'white',
    readingMode: 'vertical',
    progress: {}
  },

  themes: ['white', 'sepia', 'dark'],

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

  nextTheme(current) {
    const idx = this.themes.indexOf(current);
    return this.themes[(idx + 1) % this.themes.length];
  },

  getThemeIcon(theme) {
    return { white: '☀️', sepia: '📖', dark: '🌙' }[theme] || '☀️';
  }
};
