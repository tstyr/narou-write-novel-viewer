class NovelReader {
  constructor() {
    this.novel = null;
    this.currentChapter = 0;
    this.pages = [];
    this.currentSpread = 0;
    this.chapterData = null;
    this.settings = Settings.get();
    this.isMobile = window.innerWidth <= 768;
    this.totalChars = 0;
    this.chapterChars = [];
    
    // 読書速度計測用
    this.lastPageTurnTime = null;
    this.pageTurnIntervals = [];
    this.currentPageChars = 0;
    
    this.elements = {
      book: document.getElementById('book'),
      contentLeft: document.getElementById('content-left'),
      contentRight: document.getElementById('content-right'),
      title: document.getElementById('novel-title'),
      toc: document.getElementById('toc'),
      novelInfo: document.getElementById('novel-info'),
      chapterInfo: document.getElementById('chapter-info'),
      currentPageEl: document.getElementById('current-page'),
      totalPagesEl: document.getElementById('total-pages'),
      loading: document.getElementById('loading'),
      remainingTime: document.getElementById('remaining-time'),
      downloadSection: document.getElementById('download-section'),
      downloadBtn: document.getElementById('download-btn'),
      downloadProgress: document.getElementById('download-progress'),
      offlineStatus: document.getElementById('offline-status')
    };
    
    this.touchStartX = 0;
    this.loadingTimer = null;
  }

  // ページめくり時間を記録して読書速度を計算
  recordPageTurn() {
    const now = Date.now();
    
    if (this.lastPageTurnTime && this.currentPageChars > 0) {
      const interval = (now - this.lastPageTurnTime) / 1000; // 秒
      
      // 2秒〜5分の間のみ有効（極端な値を除外）
      if (interval >= 2 && interval <= 300) {
        const charsPerMinute = (this.currentPageChars / interval) * 60;
        
        this.pageTurnIntervals.push({
          chars: this.currentPageChars,
          seconds: interval,
          speed: charsPerMinute
        });
        
        // 最新20回分のみ保持
        if (this.pageTurnIntervals.length > 20) {
          this.pageTurnIntervals.shift();
        }
        
        // 平均読書速度を計算して保存
        this.updateReadingSpeed();
      }
    }
    
    this.lastPageTurnTime = now;
  }

  updateReadingSpeed() {
    if (this.pageTurnIntervals.length < 3) return; // 最低3回分のデータが必要
    
    // 中央値を使用（外れ値の影響を減らす）
    const speeds = this.pageTurnIntervals.map(p => p.speed).sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    const medianSpeed = speeds.length % 2 === 0 
      ? (speeds[mid - 1] + speeds[mid]) / 2 
      : speeds[mid];
    
    // 100〜2000文字/分の範囲に制限
    const clampedSpeed = Math.max(100, Math.min(2000, Math.round(medianSpeed)));
    
    this.settings.readingSpeed = clampedSpeed;
    Settings.update('readingSpeed', clampedSpeed);
  }

  // 現在表示中のページの文字数を計算
  calculateCurrentPageChars() {
    if (!this.pages.length) return 0;
    
    const getTextContent = (html) => {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.textContent.length;
    };
    
    if (this.isMobile) {
      return getTextContent(this.pages[this.currentSpread] || '');
    } else {
      const spreadIndex = this.currentSpread * 2;
      const leftChars = getTextContent(this.pages[spreadIndex] || '');
      const rightChars = getTextContent(this.pages[spreadIndex + 1] || '');
      return leftChars + rightChars;
    }
  }

  showLoading(text = '読み込み中...', delay = 150) { 
    // 遅延表示（速い読み込みではチカチカしない）
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => {
      this.elements.loading.querySelector('p').textContent = text;
      this.elements.loading.classList.remove('hidden');
    }, delay);
  }
  hideLoading() { 
    clearTimeout(this.loadingTimer);
    this.elements.loading.classList.add('hidden'); 
  }

  extractNcode(input) {
    input = input.trim();
    const match = input.match(/ncode\.syosetu\.com\/([^\/]+)/);
    if (match) return match[1].toLowerCase();
    if (/^n\d+[a-z]+$/i.test(input)) return input.toLowerCase();
    return null;
  }

  async loadFromNarou(input) {
    const ncode = this.extractNcode(input);
    if (!ncode) {
      alert('無効なURLまたはncodeです');
      return;
    }

    this.showLoading();
    try {
      // まずオフラインデータを確認
      let offlineNovel = await OfflineStorage.getNovel(ncode);
      
      if (offlineNovel) {
        this.novel = offlineNovel;
      } else {
        const res = await fetch(`/api/novel?ncode=${ncode}`);
        if (!res.ok) throw new Error((await res.json()).error);
        this.novel = await res.json();
      }
      
      this.elements.title.textContent = this.novel.title;
      this.buildToc();
      this.showNovelInfo();
      this.setupDownloadSection();
      
      // 履歴に追加
      Settings.addHistory(this.novel.id, this.novel.title, this.novel.author, this.totalChars);
      
      const progress = Settings.getProgress(ncode);
      await this.goToChapter(progress.chapterIndex || 0, progress.pageIndex || 0);
    } catch (e) {
      alert('読み込みに失敗しました: ' + e.message);
    } finally {
      this.hideLoading();
    }
  }

  async setupDownloadSection() {
    this.elements.downloadSection.classList.remove('hidden');
    
    const isDownloaded = await OfflineStorage.isNovelDownloaded(this.novel.id);
    if (isDownloaded) {
      this.elements.downloadBtn.textContent = '✓ ダウンロード済み';
      this.elements.downloadBtn.disabled = true;
      this.elements.offlineStatus.textContent = 'オフラインで読めます';
    } else {
      this.elements.downloadBtn.textContent = '📥 オフライン用にダウンロード';
      this.elements.downloadBtn.disabled = false;
      this.elements.offlineStatus.textContent = '';
    }
  }

  async downloadForOffline() {
    if (!this.novel) return;
    
    const btn = this.elements.downloadBtn;
    const progressEl = this.elements.downloadProgress;
    const progressFill = progressEl.querySelector('.progress-fill');
    const progressText = progressEl.querySelector('.progress-text');
    
    btn.disabled = true;
    btn.textContent = 'ダウンロード中...';
    progressEl.classList.remove('hidden');
    
    try {
      // 小説情報を保存
      await OfflineStorage.saveNovel(this.novel);
      
      let totalChars = 0;
      const chapterChars = [];
      
      for (let i = 0; i < this.novel.chapters.length; i++) {
        const chapter = this.novel.chapters[i];
        const percent = Math.round((i / this.novel.chapters.length) * 100);
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}% (${i}/${this.novel.chapters.length})`;
        
        // 既にダウンロード済みか確認
        let chapterData = await OfflineStorage.getChapter(this.novel.id, chapter.number);
        
        if (!chapterData) {
          const res = await fetch(`/api/chapter?ncode=${this.novel.id}&chapter=${chapter.number}`);
          if (res.ok) {
            chapterData = await res.json();
            await OfflineStorage.saveChapter(this.novel.id, chapter.number, chapterData);
          }
          // レート制限対策
          await new Promise(r => setTimeout(r, 300));
        }
        
        if (chapterData) {
          const chars = chapterData.content.join('').length;
          totalChars += chars;
          chapterChars.push(chars);
        }
      }
      
      this.totalChars = totalChars;
      this.chapterChars = chapterChars;
      Settings.updateHistoryChars(this.novel.id, totalChars);
      
      progressFill.style.width = '100%';
      progressText.textContent = '完了!';
      btn.textContent = '✓ ダウンロード済み';
      this.elements.offlineStatus.textContent = 'オフラインで読めます';
      
      setTimeout(() => progressEl.classList.add('hidden'), 2000);
    } catch (e) {
      alert('ダウンロードに失敗しました: ' + e.message);
      btn.disabled = false;
      btn.textContent = '📥 オフライン用にダウンロード';
      progressEl.classList.add('hidden');
    }
  }

  showNovelInfo() {
    this.elements.novelInfo.innerHTML = `
      <div class="info-title">${this.escapeHtml(this.novel.title)}</div>
      <div class="info-author">作者: ${this.escapeHtml(this.novel.author)}</div>
    `;
  }

  buildToc() {
    let html = '';
    let currentSection = null;
    this.novel.chapters.forEach((ch, i) => {
      if (ch.section && ch.section !== currentSection) {
        currentSection = ch.section;
        html += `<div class="toc-section">${this.escapeHtml(currentSection)}</div>`;
      }
      html += `<a href="#" data-chapter="${i}">${this.escapeHtml(ch.title)}</a>`;
    });
    this.elements.toc.innerHTML = html;
  }

  async goToChapter(index, startPage = 0) {
    if (!this.novel || index < 0 || index >= this.novel.chapters.length) return;
    
    this.showLoading();
    this.currentChapter = index;
    const chapter = this.novel.chapters[index];
    
    try {
      // まずオフラインデータを確認
      let chapterData = await OfflineStorage.getChapter(this.novel.id, chapter.number);
      
      if (!chapterData) {
        const res = await fetch(`/api/chapter?ncode=${this.novel.id}&chapter=${chapter.number}`);
        if (!res.ok) throw new Error((await res.json()).error);
        chapterData = await res.json();
      }
      
      this.chapterData = chapterData;
      
      // 文字数を記録
      if (!this.chapterChars[index]) {
        this.chapterChars[index] = chapterData.content.join('').length;
      }
      
      this.paginate();
      
      // startPageから見開きを計算
      if (this.isMobile) {
        this.currentSpread = Math.min(startPage, this.pages.length - 1);
      } else {
        this.currentSpread = Math.floor(Math.min(startPage, this.pages.length - 1) / 2);
      }
      
      this.renderSpread();
      this.updateTocActive();
      this.updateChapterInfo();
      this.updateRemainingTime();
    } catch (e) {
      this.elements.contentLeft.innerHTML = `<p>読み込み失敗: ${e.message}</p>`;
      this.elements.contentRight.innerHTML = '';
      this.pages = [];
    } finally {
      this.hideLoading();
    }
  }

  paginate() {
    this.pages = [];
    if (!this.chapterData) return;

    const isVertical = this.settings.readingMode === 'vertical';
    
    // ページサイズを取得（1ページ分）
    const pageEl = document.getElementById('page-left');
    const pageWidth = pageEl.clientWidth - 48; // padding分を引く
    const pageHeight = pageEl.clientHeight - 48;
    
    // 全コンテンツ
    const allContent = [
      `<h2 class="chapter-title">${this.escapeHtml(this.chapterData.title)}</h2>`,
      ...this.chapterData.content.map(p => `<p>${this.escapeHtml(p)}</p>`)
    ];
    
    // テスト用div
    let testDiv = document.createElement('div');
    testDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${pageWidth}px;
      height: ${pageHeight}px;
      font-size: ${this.settings.fontSize}px;
      line-height: ${this.settings.lineHeight};
      font-family: ${this.settings.fontFamily};
      overflow: hidden;
      ${isVertical ? 'writing-mode: vertical-rl;' : ''}
    `;
    document.body.appendChild(testDiv);
    
    let currentPageContent = [];
    
    for (let i = 0; i < allContent.length; i++) {
      currentPageContent.push(allContent[i]);
      testDiv.innerHTML = currentPageContent.join('');
      
      const overflow = isVertical 
        ? testDiv.scrollWidth > pageWidth
        : testDiv.scrollHeight > pageHeight;
      
      if (overflow && currentPageContent.length > 1) {
        currentPageContent.pop();
        this.pages.push(currentPageContent.join(''));
        currentPageContent = [allContent[i]];
      }
    }
    
    if (currentPageContent.length > 0) {
      this.pages.push(currentPageContent.join(''));
    }
    
    document.body.removeChild(testDiv);
    
    if (this.pages.length === 0) {
      this.pages = ['<p>コンテンツがありません</p>'];
    }
  }

  renderSpread() {
    if (this.pages.length === 0) return;
    
    const isVertical = this.settings.readingMode === 'vertical';
    
    // currentSpreadが範囲外にならないよう修正
    const maxSpread = this.getMaxSpread();
    if (this.currentSpread > maxSpread) {
      this.currentSpread = maxSpread;
    }
    if (this.currentSpread < 0) {
      this.currentSpread = 0;
    }
    
    if (this.isMobile) {
      // スマホ: 1ページ表示
      this.elements.contentLeft.innerHTML = this.pages[this.currentSpread] || '';
      this.elements.contentRight.innerHTML = '';
      
      this.elements.currentPageEl.textContent = this.currentSpread + 1;
      this.elements.totalPagesEl.textContent = this.pages.length;
      
      Settings.saveProgress(this.novel?.id, this.currentChapter, this.currentSpread);
    } else {
      // PC: 見開き2ページ
      const spreadIndex = this.currentSpread * 2;
      
      if (isVertical) {
        // 縦書き: 右ページが先、左ページが後
        this.elements.contentRight.innerHTML = this.pages[spreadIndex] || '';
        this.elements.contentLeft.innerHTML = this.pages[spreadIndex + 1] || '';
      } else {
        // 横書き: 左ページが先、右ページが後
        this.elements.contentLeft.innerHTML = this.pages[spreadIndex] || '';
        this.elements.contentRight.innerHTML = this.pages[spreadIndex + 1] || '';
      }
      
      // ページ番号表示（見開き番号）
      const totalSpreads = Math.max(1, Math.ceil(this.pages.length / 2));
      this.elements.currentPageEl.textContent = this.currentSpread + 1;
      this.elements.totalPagesEl.textContent = totalSpreads;
      
      Settings.saveProgress(this.novel?.id, this.currentChapter, spreadIndex);
    }
    
    // 現在のページの文字数を記録
    this.currentPageChars = this.calculateCurrentPageChars();
    
    this.updateRemainingTime();
  }

  updateChapterInfo() {
    if (!this.novel) return;
    this.elements.chapterInfo.textContent = `${this.currentChapter + 1}/${this.novel.chapters.length}話 | `;
  }

  updateRemainingTime() {
    if (!this.novel || !this.chapterData) {
      this.elements.remainingTime.textContent = '';
      return;
    }
    
    const readingSpeed = this.settings.readingSpeed || 500; // 文字/分
    
    // 現在の章の残り文字数を計算
    const currentChapterChars = this.chapterData.content.join('').length;
    const currentPageRatio = this.isMobile 
      ? (this.currentSpread + 1) / this.pages.length
      : (this.currentSpread + 1) / Math.ceil(this.pages.length / 2);
    const remainingInChapter = Math.round(currentChapterChars * (1 - currentPageRatio));
    
    // 残りの章の文字数を推定
    let remainingChars = remainingInChapter;
    const avgCharsPerChapter = this.chapterChars.length > 0 
      ? this.chapterChars.reduce((a, b) => a + b, 0) / this.chapterChars.length
      : currentChapterChars;
    
    for (let i = this.currentChapter + 1; i < this.novel.chapters.length; i++) {
      remainingChars += this.chapterChars[i] || avgCharsPerChapter;
    }
    
    // 残り時間を計算
    const remainingMinutes = Math.ceil(remainingChars / readingSpeed);
    
    let timeText;
    if (remainingMinutes < 60) {
      timeText = `残り約${remainingMinutes}分`;
    } else {
      const hours = Math.floor(remainingMinutes / 60);
      const mins = remainingMinutes % 60;
      timeText = `残り約${hours}時間${mins > 0 ? mins + '分' : ''}`;
    }
    
    // 読書速度が計測されている場合は表示
    if (this.pageTurnIntervals.length >= 3) {
      this.elements.remainingTime.textContent = `${timeText} (${readingSpeed}字/分)`;
    } else {
      this.elements.remainingTime.textContent = timeText;
    }
  }

  updateTocActive() {
    document.querySelectorAll('#toc a').forEach((a, i) => {
      a.classList.toggle('active', i === this.currentChapter);
    });
  }

  getMaxSpread() {
    if (this.isMobile) {
      return this.pages.length - 1;
    } else {
      return Math.ceil(this.pages.length / 2) - 1;
    }
  }

  nextPage() {
    if (this.currentSpread < this.getMaxSpread()) {
      this.recordPageTurn();
      this.currentSpread++;
      this.currentPageChars = this.calculateCurrentPageChars();
      this.renderSpread();
    } else if (this.currentChapter < this.novel.chapters.length - 1) {
      this.recordPageTurn();
      this.goToChapter(this.currentChapter + 1, 0);
    }
  }

  prevPage() {
    if (this.currentSpread > 0) {
      this.recordPageTurn();
      this.currentSpread--;
      this.currentPageChars = this.calculateCurrentPageChars();
      this.renderSpread();
    } else if (this.currentChapter > 0) {
      this.recordPageTurn();
      this.goToChapter(this.currentChapter - 1, 9999);
    }
  }

  setReadingMode(mode) {
    this.settings.readingMode = mode;
    Settings.update('readingMode', mode);
    this.elements.book.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.book.classList.add(`${mode}-mode`);
    
    if (this.chapterData) {
      this.paginate();
      this.currentSpread = 0;
      this.renderSpread();
    }
  }

  setFontSize(size) {
    this.settings.fontSize = size;
    Settings.update('fontSize', size);
    document.querySelectorAll('.page-content').forEach(el => el.style.fontSize = `${size}px`);
    
    if (this.chapterData) {
      this.paginate();
      this.currentSpread = 0;
      this.renderSpread();
    }
  }

  setLineHeight(height) {
    this.settings.lineHeight = height;
    Settings.update('lineHeight', height);
    document.querySelectorAll('.page-content').forEach(el => el.style.lineHeight = height);
    
    if (this.chapterData) {
      this.paginate();
      this.currentSpread = 0;
      this.renderSpread();
    }
  }

  setFontFamily(family) {
    this.settings.fontFamily = family;
    Settings.update('fontFamily', family);
    document.querySelectorAll('.page-content').forEach(el => el.style.fontFamily = family);
    
    if (this.chapterData) {
      this.paginate();
      this.currentSpread = 0;
      this.renderSpread();
    }
  }

  applySettings() {
    document.querySelectorAll('.page-content').forEach(el => {
      el.style.fontSize = `${this.settings.fontSize}px`;
      el.style.lineHeight = this.settings.lineHeight;
      el.style.fontFamily = this.settings.fontFamily;
    });
    this.elements.book.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.book.classList.add(`${this.settings.readingMode}-mode`);
  }

  handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
  }

  handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    
    if (Math.abs(dx) > 50) {
      const isVertical = this.settings.readingMode === 'vertical';
      if (dx > 0) {
        isVertical ? this.nextPage() : this.prevPage();
      } else {
        isVertical ? this.prevPage() : this.nextPage();
      }
    }
  }

  onResize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;
    
    if (this.chapterData) {
      // 現在のページ位置を保持
      const currentPageIndex = wasMobile ? this.currentSpread : this.currentSpread * 2;
      
      this.paginate();
      
      // 新しいモードでの見開きを計算
      if (this.isMobile) {
        this.currentSpread = Math.min(currentPageIndex, this.pages.length - 1);
      } else {
        this.currentSpread = Math.floor(Math.min(currentPageIndex, this.pages.length - 1) / 2);
      }
      
      this.renderSpread();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
