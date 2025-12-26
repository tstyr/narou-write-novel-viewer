// 読書統計管理
const ReadingStats = {
  storageKey: 'novelViewerStats',

  getAll() {
    const saved = localStorage.getItem(this.storageKey);
    return saved ? JSON.parse(saved) : { sessions: [], dailyStats: {}, novelStats: {} };
  },

  save(stats) {
    localStorage.setItem(this.storageKey, JSON.stringify(stats));
  },

  // 読書セッション記録
  recordSession(novelId, novelTitle, chapterIndex, chapterTitle, duration, charCount) {
    const stats = this.getAll();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // セッション追加
    stats.sessions.push({
      novelId,
      novelTitle,
      chapterIndex,
      chapterTitle,
      duration, // 秒
      charCount,
      timestamp: now,
      date: today
    });

    // 最大1000件保持
    if (stats.sessions.length > 1000) {
      stats.sessions = stats.sessions.slice(-1000);
    }

    // 日別統計更新
    if (!stats.dailyStats[today]) {
      stats.dailyStats[today] = { totalTime: 0, totalChars: 0, sessions: 0 };
    }
    stats.dailyStats[today].totalTime += duration;
    stats.dailyStats[today].totalChars += charCount;
    stats.dailyStats[today].sessions += 1;

    // 小説別統計更新
    if (!stats.novelStats[novelId]) {
      stats.novelStats[novelId] = {
        title: novelTitle,
        totalTime: 0,
        totalChars: 0,
        chapters: {},
        firstRead: now,
        lastRead: now
      };
    }
    const ns = stats.novelStats[novelId];
    ns.totalTime += duration;
    ns.totalChars += charCount;
    ns.lastRead = now;
    ns.title = novelTitle;

    // 章別統計
    if (!ns.chapters[chapterIndex]) {
      ns.chapters[chapterIndex] = {
        title: chapterTitle,
        totalTime: 0,
        charCount: 0,
        readCount: 0,
        lastRead: now
      };
    }
    ns.chapters[chapterIndex].totalTime += duration;
    ns.chapters[chapterIndex].charCount = charCount;
    ns.chapters[chapterIndex].readCount += 1;
    ns.chapters[chapterIndex].lastRead = now;
    ns.chapters[chapterIndex].title = chapterTitle;

    this.save(stats);
  },

  // 総合統計取得
  getSummary() {
    const stats = this.getAll();
    let totalTime = 0;
    let totalChars = 0;
    let totalSessions = stats.sessions.length;

    for (const day of Object.values(stats.dailyStats)) {
      totalTime += day.totalTime;
      totalChars += day.totalChars;
    }

    return {
      totalTime,
      totalChars,
      totalSessions,
      avgTimePerSession: totalSessions > 0 ? totalTime / totalSessions : 0,
      avgCharsPerMin: totalTime > 0 ? (totalChars / (totalTime / 60)) : 0,
      novelCount: Object.keys(stats.novelStats).length
    };
  },

  // 日別データ取得（過去N日）
  getDailyData(days = 30) {
    const stats = this.getAll();
    const result = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayStats = stats.dailyStats[dateStr] || { totalTime: 0, totalChars: 0, sessions: 0 };
      result.push({
        date: dateStr,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        ...dayStats
      });
    }
    return result;
  },

  // 小説別統計取得
  getNovelStats() {
    const stats = this.getAll();
    return Object.entries(stats.novelStats)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.lastRead - a.lastRead);
  },

  // 特定小説の章別統計
  getChapterStats(novelId) {
    const stats = this.getAll();
    const novel = stats.novelStats[novelId];
    if (!novel) return [];

    return Object.entries(novel.chapters)
      .map(([idx, data]) => ({ chapterIndex: parseInt(idx), ...data }))
      .sort((a, b) => a.chapterIndex - b.chapterIndex);
  }
};
