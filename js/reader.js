class NovelReader {
  constructor() {
    this.novel = null;
    this.currentChapter = 0;
    this.pages = [];
    this.currentPage = 0;
    this.chapterData = null;
    this.settings = Settings.get();
    
    this.elements = {
      page: document.getElementById('page'),
      pageContent: document.getElementById('page-content'),
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
      this.currentPage = Math.min(startPage, this.pages.length - 1);
      this.renderPage();
      this.updateTocActive();
      this.updateChapterInfo();
    } catch (e) {
      this.elements.pageContent.innerHTML = `<p>読み込み失敗: ${e.message}</p>`;
      this.pages = [];
    } finally {
      this.hideLoading();
    }
  }

  paginate() {
    this.pages = [];
    if (!this.chapterData) return;

    const content = this.elements.pageContent;
    const isVertical = this.settings.readingMode === 'vertical';
    
    // 一時的にコンテンツを設定してサイズを計測
    const allContent = [
      `<h2 class="chapter-title">${this.escapeHtml(this.chapterData.title)}</h2>`,
      ...this.chapterData.content.map(p => `<p>${this.escapeHtml(p)}</p>`)
    ];
    
    // ページサイズを取得
    const pageWidth = content.clientWidth;
    const pageHeight = content.clientHeight;
    
    // 各段落を1つずつ追加してページを構築
    let currentPageContent = [];
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
    
    for (let i = 0; i < allContent.length; i++) {
      currentPageContent.push(allContent[i]);
      testDiv.innerHTML = currentPageContent.join('');
      
      const overflow = isVertical 
        ? testDiv.scrollWidth > pageWidth
        : testDiv.scrollHeight > pageHeight;
      
      if (overflow && currentPageContent.length > 1) {
        // 最後の要素を除いてページを確定
        currentPageContent.pop();
        this.pages.push(currentPageContent.join(''));
        currentPageContent = [allContent[i]];
      }
    }
    
    // 残りをページに追加
    if (currentPageContent.length > 0) {
      this.pages.push(currentPageContent.join(''));
    }
    
    document.body.removeChild(testDiv);
    
    if (this.pages.length === 0) {
      this.pages = ['<p>コンテンツがありません</p>'];
    }
  }

  renderPage() {
    if (this.pages.length === 0) return;
    
    this.elements.pageContent.innerHTML = this.pages[this.currentPage];
    this.elements.currentPageEl.textContent = this.currentPage + 1;
    this.elements.totalPagesEl.textContent = this.pages.length;
    
    Settings.saveProgress(this.novel?.id, this.currentChapter, this.currentPage);
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

  nextPage() {
    if (this.currentPage < this.pages.length - 1) {
      this.currentPage++;
      this.renderPage();
    } else if (this.currentChapter < this.novel.chapters.length - 1) {
      // 次の章へ
      this.goToChapter(this.currentChapter + 1, 0);
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderPage();
    } else if (this.currentChapter > 0) {
      // 前の章の最後のページへ
      this.goToChapter(this.currentChapter - 1, 9999);
    }
  }

  setReadingMode(mode) {
    this.settings.readingMode = mode;
    Settings.update('readingMode', mode);
    this.elements.page.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.page.classList.add(`${mode}-mode`);
    
    if (this.chapterData) {
      this.paginate();
      this.currentPage = 0;
      this.renderPage();
    }
  }

  setFontSize(size) {
    this.settings.fontSize = size;
    Settings.update('fontSize', size);
    this.elements.pageContent.style.fontSize = `${size}px`;
    
    if (this.chapterData) {
      this.paginate();
      this.currentPage = 0;
      this.renderPage();
    }
  }

  setLineHeight(height) {
    this.settings.lineHeight = height;
    Settings.update('lineHeight', height);
    this.elements.pageContent.style.lineHeight = height;
    
    if (this.chapterData) {
      this.paginate();
      this.currentPage = 0;
      this.renderPage();
    }
  }

  setFontFamily(family) {
    this.settings.fontFamily = family;
    Settings.update('fontFamily', family);
    this.elements.pageContent.style.fontFamily = family;
    
    if (this.chapterData) {
      this.paginate();
      this.currentPage = 0;
      this.renderPage();
    }
  }

  applySettings() {
    this.elements.pageContent.style.fontSize = `${this.settings.fontSize}px`;
    this.elements.pageContent.style.lineHeight = this.settings.lineHeight;
    this.elements.pageContent.style.fontFamily = this.settings.fontFamily;
    this.elements.page.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.page.classList.add(`${this.settings.readingMode}-mode`);
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
