class NovelReader {
  constructor() {
    this.novel = null;
    this.currentChapter = 0;
    this.pages = [];
    this.currentPage = 0;
    this.settings = Settings.get();
    this.isMobile = window.innerWidth <= 768;
    
    this.elements = {
      book: document.getElementById('book'),
      contentLeft: document.getElementById('content-left'),
      contentRight: document.getElementById('content-right'),
      pageNumLeft: document.getElementById('page-num-left'),
      pageNumRight: document.getElementById('page-num-right'),
      title: document.getElementById('novel-title'),
      toc: document.getElementById('toc'),
      novelInfo: document.getElementById('novel-info'),
      currentPage: document.getElementById('current-page'),
      totalPages: document.getElementById('total-pages'),
      loading: document.getElementById('loading')
    };
    
    this.touchStartX = 0;
    this.touchStartY = 0;
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
    if (!this.novel) return;
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
      html += `<a href="#" data-chapter="${i}">${ch.number}. ${this.escapeHtml(ch.title)}</a>`;
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
      
      const data = await res.json();
      this.paginateContent(data);
      this.currentPage = Math.min(startPage, this.pages.length - 1);
      this.renderPages();
      this.updateTocActive();
      Settings.saveProgress(this.novel.id, index, 0);
    } catch (e) {
      this.elements.contentLeft.innerHTML = `<p>読み込み失敗: ${e.message}</p>`;
      this.elements.contentRight.innerHTML = '';
    } finally {
      this.hideLoading();
    }
  }

  paginateContent(data) {
    // コンテンツをページに分割
    const container = document.createElement('div');
    container.innerHTML = `
      <h2 class="chapter-title">${this.escapeHtml(data.title)}</h2>
      ${data.content.map(p => `<p>${this.escapeHtml(p)}</p>`).join('')}
    `;
    
    // 仮のコンテナでページ分割を計算
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${this.getPageWidth()}px;
      height: ${this.getPageHeight()}px;
      font-size: ${this.settings.fontSize}px;
      line-height: ${this.settings.lineHeight};
      font-family: ${this.settings.fontFamily};
      padding: 1rem;
      ${this.settings.readingMode === 'vertical' ? 'writing-mode: vertical-rl;' : ''}
    `;
    tempDiv.innerHTML = container.innerHTML;
    document.body.appendChild(tempDiv);
    
    // 簡易的なページ分割（段落単位）
    this.pages = [];
    const paragraphs = Array.from(tempDiv.children);
    let currentPageContent = [];
    let currentHeight = 0;
    const maxHeight = this.getPageHeight() - 60;
    const isVertical = this.settings.readingMode === 'vertical';
    
    paragraphs.forEach(p => {
      const pHeight = isVertical ? p.offsetWidth : p.offsetHeight;
      if (currentHeight + pHeight > maxHeight && currentPageContent.length > 0) {
        this.pages.push(currentPageContent.map(el => el.outerHTML).join(''));
        currentPageContent = [];
        currentHeight = 0;
      }
      currentPageContent.push(p.cloneNode(true));
      currentHeight += pHeight + 10;
    });
    
    if (currentPageContent.length > 0) {
      this.pages.push(currentPageContent.map(el => el.outerHTML).join(''));
    }
    
    // 章ナビを最後のページに追加
    const navHtml = `
      <div class="chapter-nav">
        <button id="prev-chapter" ${this.currentChapter === 0 ? 'disabled' : ''}>← 前の話</button>
        <button id="next-chapter" ${this.currentChapter >= this.novel.chapters.length - 1 ? 'disabled' : ''}>次の話 →</button>
      </div>
    `;
    if (this.pages.length > 0) {
      this.pages[this.pages.length - 1] += navHtml;
    }
    
    document.body.removeChild(tempDiv);
    
    if (this.pages.length === 0) {
      this.pages = ['<p>コンテンツがありません</p>'];
    }
  }

  getPageWidth() {
    const book = this.elements.book;
    return this.isMobile ? book.clientWidth - 40 : (book.clientWidth / 2) - 60;
  }

  getPageHeight() {
    return this.elements.book.clientHeight - 80;
  }

  renderPages() {
    const isVertical = this.settings.readingMode === 'vertical';
    const pagesPerSpread = this.isMobile ? 1 : 2;
    
    // 縦書きは右から左、横書きは左から右
    let leftIdx, rightIdx;
    if (isVertical) {
      // 縦書き: 右ページが先
      rightIdx = this.currentPage;
      leftIdx = this.currentPage + 1;
    } else {
      // 横書き: 左ページが先
      leftIdx = this.currentPage;
      rightIdx = this.currentPage + 1;
    }
    
    if (this.isMobile) {
      // スマホは1ページ表示
      this.elements.contentLeft.innerHTML = this.pages[this.currentPage] || '';
      this.elements.pageNumLeft.textContent = `${this.currentPage + 1}`;
      this.elements.contentRight.innerHTML = '';
      this.elements.pageNumRight.textContent = '';
    } else {
      // PC見開き
      this.elements.contentLeft.innerHTML = this.pages[leftIdx] || '';
      this.elements.contentRight.innerHTML = this.pages[rightIdx] || '';
      this.elements.pageNumLeft.textContent = this.pages[leftIdx] ? `${leftIdx + 1}` : '';
      this.elements.pageNumRight.textContent = this.pages[rightIdx] ? `${rightIdx + 1}` : '';
    }
    
    // ページインジケーター更新
    this.elements.currentPage.textContent = this.currentPage + 1;
    this.elements.totalPages.textContent = this.pages.length;
    
    // 章ナビのイベント
    document.getElementById('prev-chapter')?.addEventListener('click', () => this.goToChapter(this.currentChapter - 1));
    document.getElementById('next-chapter')?.addEventListener('click', () => this.goToChapter(this.currentChapter + 1));
    
    Settings.saveProgress(this.novel?.id, this.currentChapter, this.currentPage);
  }

  nextPage() {
    const step = this.isMobile ? 1 : 2;
    if (this.currentPage + step < this.pages.length) {
      this.currentPage += step;
      this.renderPages();
    }
  }

  prevPage() {
    const step = this.isMobile ? 1 : 2;
    if (this.currentPage - step >= 0) {
      this.currentPage -= step;
      this.renderPages();
    } else if (this.currentPage > 0) {
      this.currentPage = 0;
      this.renderPages();
    }
  }

  updateTocActive() {
    document.querySelectorAll('#toc a').forEach((a, i) => {
      a.classList.toggle('active', i === this.currentChapter);
    });
  }

  setReadingMode(mode) {
    this.settings.readingMode = mode;
    Settings.update('readingMode', mode);
    this.elements.book.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.book.classList.add(`${mode}-mode`);
    if (this.pages.length > 0) {
      this.paginateContent({ title: '', content: [] }); // 再計算
      this.goToChapter(this.currentChapter, 0);
    }
  }

  setFontSize(size) {
    this.settings.fontSize = size;
    Settings.update('fontSize', size);
    document.querySelectorAll('.page-content').forEach(el => el.style.fontSize = `${size}px`);
    if (this.novel) this.goToChapter(this.currentChapter, 0);
  }

  setLineHeight(height) {
    this.settings.lineHeight = height;
    Settings.update('lineHeight', height);
    document.querySelectorAll('.page-content').forEach(el => el.style.lineHeight = height);
    if (this.novel) this.goToChapter(this.currentChapter, 0);
  }

  setFontFamily(family) {
    this.settings.fontFamily = family;
    Settings.update('fontFamily', family);
    document.querySelectorAll('.page-content').forEach(el => el.style.fontFamily = family);
    if (this.novel) this.goToChapter(this.currentChapter, 0);
  }

  applySettings() {
    const contents = document.querySelectorAll('.page-content');
    contents.forEach(el => {
      el.style.fontSize = `${this.settings.fontSize}px`;
      el.style.lineHeight = this.settings.lineHeight;
      el.style.fontFamily = this.settings.fontFamily;
    });
    this.setReadingMode(this.settings.readingMode);
  }

  handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
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

  onResize() {
    this.isMobile = window.innerWidth <= 768;
    if (this.novel) {
      this.goToChapter(this.currentChapter, this.currentPage);
    }
  }
}
