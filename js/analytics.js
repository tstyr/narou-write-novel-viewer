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
      duration,
      charCount,
      timestamp: now,
      date: today
    });

    // 最大2000件保持
    if (stats.sessions.length > 2000) {
      stats.sessions = stats.sessions.slice(-2000);
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
    return this.getSummaryForPeriod(9999);
  },

  // 期間別統計取得
  getSummaryForPeriod(days) {
    const stats = this.getAll();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let totalTime = 0;
    let totalChars = 0;
    let totalSessions = 0;
    const novelsInPeriod = new Set();

    // 日別統計から集計
    for (const [date, day] of Object.entries(stats.dailyStats)) {
      if (date >= cutoffStr) {
        totalTime += day.totalTime;
        totalChars += day.totalChars;
        totalSessions += day.sessions;
      }
    }

    // 期間内のセッションから作品数をカウント
    stats.sessions.forEach(s => {
      if (s.date >= cutoffStr) {
        novelsInPeriod.add(s.novelId);
      }
    });

    const activeDays = Math.min(days, Object.keys(stats.dailyStats).filter(d => d >= cutoffStr).length) || 1;

    return {
      totalTime,
      totalChars,
      totalSessions,
      avgTimePerSession: totalSessions > 0 ? totalTime / totalSessions : 0,
      avgTimePerDay: totalTime / activeDays,
      avgCharsPerMin: totalTime > 0 ? (totalChars / (totalTime / 60)) : 0,
      novelCount: novelsInPeriod.size
    };
  },

  // 日別データ取得（過去N日）
  getDailyData(days = 30) {
    const stats = this.getAll();
    const result = [];
    const today = new Date();

    // 全期間の場合は最初のデータから
    let startDate = new Date(today);
    if (days >= 9999) {
      const allDates = Object.keys(stats.dailyStats).sort();
      if (allDates.length > 0) {
        startDate = new Date(allDates[0]);
        days = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
      } else {
        days = 30;
      }
    }

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
  },

  // クラウドデータとマージ
  mergeFromCloud(cloudStats) {
    if (!cloudStats) return;
    
    const local = this.getAll();
    
    // セッションをマージ（重複除去）
    if (cloudStats.sessions) {
      const localTimestamps = new Set(local.sessions.map(s => s.timestamp));
      cloudStats.sessions.forEach(s => {
        if (!localTimestamps.has(s.timestamp)) {
          local.sessions.push(s);
        }
      });
      // タイムスタンプでソートして最新2000件
      local.sessions.sort((a, b) => a.timestamp - b.timestamp);
      if (local.sessions.length > 2000) {
        local.sessions = local.sessions.slice(-2000);
      }
    }

    // 日別統計をマージ
    if (cloudStats.dailyStats) {
      for (const [date, cloudDay] of Object.entries(cloudStats.dailyStats)) {
        if (!local.dailyStats[date]) {
          local.dailyStats[date] = cloudDay;
        } else {
          // より大きい値を採用
          local.dailyStats[date].totalTime = Math.max(local.dailyStats[date].totalTime, cloudDay.totalTime);
          local.dailyStats[date].totalChars = Math.max(local.dailyStats[date].totalChars, cloudDay.totalChars);
          local.dailyStats[date].sessions = Math.max(local.dailyStats[date].sessions, cloudDay.sessions);
        }
      }
    }

    // 小説別統計をマージ
    if (cloudStats.novelStats) {
      for (const [novelId, cloudNovel] of Object.entries(cloudStats.novelStats)) {
        if (!local.novelStats[novelId]) {
          local.novelStats[novelId] = cloudNovel;
        } else {
          const localNovel = local.novelStats[novelId];
          localNovel.totalTime = Math.max(localNovel.totalTime, cloudNovel.totalTime);
          localNovel.totalChars = Math.max(localNovel.totalChars, cloudNovel.totalChars);
          localNovel.lastRead = Math.max(localNovel.lastRead, cloudNovel.lastRead);
          localNovel.firstRead = Math.min(localNovel.firstRead || Infinity, cloudNovel.firstRead || Infinity);
          
          // 章別統計をマージ
          if (cloudNovel.chapters) {
            for (const [chIdx, cloudCh] of Object.entries(cloudNovel.chapters)) {
              if (!localNovel.chapters[chIdx]) {
                localNovel.chapters[chIdx] = cloudCh;
              } else {
                const localCh = localNovel.chapters[chIdx];
                localCh.totalTime = Math.max(localCh.totalTime, cloudCh.totalTime);
                localCh.charCount = Math.max(localCh.charCount, cloudCh.charCount);
                localCh.readCount = Math.max(localCh.readCount, cloudCh.readCount);
                localCh.lastRead = Math.max(localCh.lastRead, cloudCh.lastRead);
              }
            }
          }
        }
      }
    }

    this.save(local);
  }
};
