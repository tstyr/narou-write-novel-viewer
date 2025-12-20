class NovelReader {
  constructor() {
    this.novel = null;
    this.currentChapter = 0;
    this.pages = [];
    this.currentSpread = 0; // 見開きのインデックス
    this.chapterData = null;
    this.settings = Settings.get();
    this.isMobile = window.innerWidth <= 768;
    
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
      loading: document.getElementById('loading')
    };
    
    this.touchStartX = 0;
  }

  showLoading() { this.elements.loading.classList.remove('hidden'); }
  hideLoading() { this.elements.loading.classList.add('hidden'); }

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
      const res = await fetch(`/api/novel?ncode=${ncode}`);
      if (!res.ok) throw new Error((await res.json()).error);
      
      this.novel = await res.json();
      this.elements.title.textContent = this.novel.title;
      this.buildToc();
      this.showNovelInfo();
      
      // 履歴に追加
      Settings.addHistory(this.novel.id, this.novel.title, this.novel.author);
      
      const progress = Settings.getProgress(ncode);
      await this.goToChapter(progress.chapterIndex || 0, progress.pageIndex || 0);
    } catch (e) {
      alert('読み込みに失敗しました: ' + e.message);
    } finally {
      this.hideLoading();
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
      const res = await fetch(`/api/chapter?ncode=${this.novel.id}&chapter=${chapter.number}`);
      if (!res.ok) throw new Error((await res.json()).error);
      
      this.chapterData = await res.json();
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
  }

  updateChapterInfo() {
    if (!this.novel) return;
    this.elements.chapterInfo.textContent = `${this.currentChapter + 1}/${this.novel.chapters.length}話 | `;
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
      this.currentSpread++;
      this.renderSpread();
    } else if (this.currentChapter < this.novel.chapters.length - 1) {
      this.goToChapter(this.currentChapter + 1, 0);
    }
  }

  prevPage() {
    if (this.currentSpread > 0) {
      this.currentSpread--;
      this.renderSpread();
    } else if (this.currentChapter > 0) {
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
