const Settings = {
  defaults: {
    fontSize: 18,
    lineHeight: 1.8,
    fontFamily: "'Noto Serif JP', serif",
    theme: 'white',
    readingMode: 'vertical',
    progress: {},
    history: [],
    readingSpeed: 500 // 文字/分（デフォルト）
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

  addHistory(novelId, title, author, totalChars = 0) {
    const settings = this.get();
    if (!settings.history) settings.history = [];
    
    // 既存の同じ小説を削除
    const existing = settings.history.find(h => h.id === novelId);
    settings.history = settings.history.filter(h => h.id !== novelId);
    
    // 先頭に追加
    settings.history.unshift({
      id: novelId,
      title: title,
      author: author,
      totalChars: totalChars || existing?.totalChars || 0,
      lastRead: Date.now()
    });
    
    // 最大数を超えたら古いものを削除
    if (settings.history.length > this.maxHistory) {
      settings.history = settings.history.slice(0, this.maxHistory);
    }
    
    this.save(settings);
  },

  updateHistoryChars(novelId, totalChars) {
    const settings = this.get();
    const item = settings.history?.find(h => h.id === novelId);
    if (item) {
      item.totalChars = totalChars;
      this.save(settings);
    }
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
    // オフラインデータも削除
    OfflineStorage.deleteNovel(novelId);
  },

  nextTheme(current) {
    const idx = this.themes.indexOf(current);
    return this.themes[(idx + 1) % this.themes.length];
  },

  getThemeIcon(theme) {
    return { white: '☀️', sepia: '📖', dark: '🌙' }[theme] || '☀️';
  }
};

// オフラインストレージ
const OfflineStorage = {
  dbName: 'NovelViewerOffline',
  dbVersion: 1,
  db: null,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('novels')) {
          db.createObjectStore('novels', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chapters')) {
          const store = db.createObjectStore('chapters', { keyPath: ['novelId', 'number'] });
          store.createIndex('novelId', 'novelId');
        }
      };
    });
  },

  async saveNovel(novel) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('novels', 'readwrite');
      tx.objectStore('novels').put(novel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getNovel(novelId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('novels', 'readonly');
      const request = tx.objectStore('novels').get(novelId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async saveChapter(novelId, number, data) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chapters', 'readwrite');
      tx.objectStore('chapters').put({ novelId, number, ...data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getChapter(novelId, number) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chapters', 'readonly');
      const request = tx.objectStore('chapters').get([novelId, number]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getDownloadedChapters(novelId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('chapters', 'readonly');
      const index = tx.objectStore('chapters').index('novelId');
      const request = index.getAllKeys(IDBKeyRange.only(novelId));
      request.onsuccess = () => resolve(request.result.map(k => k[1]));
      request.onerror = () => reject(request.error);
    });
  },

  async deleteNovel(novelId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['novels', 'chapters'], 'readwrite');
      tx.objectStore('novels').delete(novelId);
      
      const index = tx.objectStore('chapters').index('novelId');
      const request = index.openCursor(IDBKeyRange.only(novelId));
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async isNovelDownloaded(novelId) {
    const novel = await this.getNovel(novelId);
    if (!novel) return false;
    const chapters = await this.getDownloadedChapters(novelId);
    return chapters.length === novel.chapters.length;
  }
};
