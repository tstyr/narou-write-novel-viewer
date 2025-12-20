class NovelReader {
  constructor() {
    this.novel = null;
    this.currentChapter = 0;
    this.settings = Settings.get();
    
    this.elements = {
      reader: document.getElementById('reader'),
      content: document.getElementById('content'),
      title: document.getElementById('novel-title'),
      toc: document.getElementById('toc'),
      novelInfo: document.getElementById('novel-info'),
      chapterInfo: document.getElementById('chapter-info'),
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
      await this.goToChapter(progress.chapterIndex || 0);
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
      html += `<a href="#" data-chapter="${i}">${this.escapeHtml(ch.title)}</a>`;
    });
    this.elements.toc.innerHTML = html;
  }

  async goToChapter(index) {
    if (!this.novel || index < 0 || index >= this.novel.chapters.length) return;
    
    this.showLoading();
    this.currentChapter = index;
    const chapter = this.novel.chapters[index];
    
    try {
      const res = await fetch(`/api/chapter?ncode=${this.novel.id}&chapter=${chapter.number}`);
      if (!res.ok) throw new Error((await res.json()).error);
      
      const data = await res.json();
      
      const html = `
        <h2 class="chapter-title">${this.escapeHtml(data.title)}</h2>
        ${data.content.map(p => `<p>${this.escapeHtml(p)}</p>`).join('')}
        <div class="chapter-nav">
          <button id="prev-chapter" ${index === 0 ? 'disabled' : ''}>← 前の話</button>
          <button id="next-chapter" ${index >= this.novel.chapters.length - 1 ? 'disabled' : ''}>次の話 →</button>
        </div>
      `;
      this.elements.content.innerHTML = html;
      
      // スクロールリセット
      this.elements.content.scrollTop = 0;
      this.elements.content.scrollLeft = this.elements.content.scrollWidth;
      
      // 章ナビイベント
      document.getElementById('prev-chapter')?.addEventListener('click', () => this.goToChapter(index - 1));
      document.getElementById('next-chapter')?.addEventListener('click', () => this.goToChapter(index + 1));
      
      this.updateTocActive();
      this.updateChapterInfo();
      this.updatePageIndicator();
      Settings.saveProgress(this.novel.id, index, 0);
      
      // スクロールイベント
      this.elements.content.addEventListener('scroll', () => this.updatePageIndicator());
      
    } catch (e) {
      this.elements.content.innerHTML = `<p>読み込み失敗: ${e.message}</p>`;
    } finally {
      this.hideLoading();
    }
  }

  updateChapterInfo() {
    if (!this.novel) return;
    const chapter = this.novel.chapters[this.currentChapter];
    this.elements.chapterInfo.textContent = `第${this.currentChapter + 1}話/${this.novel.chapters.length}話 | `;
  }

  updatePageIndicator() {
    const content = this.elements.content;
    const isVertical = this.settings.readingMode === 'vertical';
    
    let current, total;
    if (isVertical) {
      const scrollWidth = content.scrollWidth;
      const clientWidth = content.clientWidth;
      const scrollLeft = scrollWidth - clientWidth - content.scrollLeft;
      total = Math.max(1, Math.ceil(scrollWidth / clientWidth));
      current = Math.max(1, Math.ceil((scrollLeft + clientWidth) / clientWidth));
    } else {
      const scrollHeight = content.scrollHeight;
      const clientHeight = content.clientHeight;
      total = Math.max(1, Math.ceil(scrollHeight / clientHeight));
      current = Math.max(1, Math.ceil((content.scrollTop + clientHeight) / clientHeight));
    }
    
    this.elements.currentPage.textContent = current;
    this.elements.totalPages.textContent = total;
  }

  updateTocActive() {
    document.querySelectorAll('#toc a').forEach((a, i) => {
      a.classList.toggle('active', i === this.currentChapter);
    });
  }

  scrollPage(direction) {
    const content = this.elements.content;
    const isVertical = this.settings.readingMode === 'vertical';
    
    // スマホでは小さめのスクロール量
    const isMobile = window.innerWidth <= 600;
    const ratio = isMobile ? 0.7 : 0.85;
    
    if (isVertical) {
      const amount = content.clientWidth * ratio;
      content.scrollBy({ left: direction * -amount, behavior: 'smooth' });
    } else {
      const amount = content.clientHeight * ratio;
      content.scrollBy({ top: direction * amount, behavior: 'smooth' });
    }
  }

  nextPage() { this.scrollPage(1); }
  prevPage() { this.scrollPage(-1); }

  setReadingMode(mode) {
    this.settings.readingMode = mode;
    Settings.update('readingMode', mode);
    this.elements.reader.classList.remove('vertical-mode', 'horizontal-mode');
    this.elements.reader.classList.add(`${mode}-mode`);
    
    // スクロール位置リセット
    if (mode === 'vertical') {
      this.elements.content.scrollLeft = this.elements.content.scrollWidth;
    } else {
      this.elements.content.scrollTop = 0;
    }
    this.updatePageIndicator();
  }

  setFontSize(size) {
    this.settings.fontSize = size;
    Settings.update('fontSize', size);
    this.elements.content.style.fontSize = `${size}px`;
    this.updatePageIndicator();
  }

  setLineHeight(height) {
    this.settings.lineHeight = height;
    Settings.update('lineHeight', height);
    this.elements.content.style.lineHeight = height;
    this.updatePageIndicator();
  }

  setFontFamily(family) {
    this.settings.fontFamily = family;
    Settings.update('fontFamily', family);
    this.elements.content.style.fontFamily = family;
    this.updatePageIndicator();
  }

  applySettings() {
    this.elements.content.style.fontSize = `${this.settings.fontSize}px`;
    this.elements.content.style.lineHeight = this.settings.lineHeight;
    this.elements.content.style.fontFamily = this.settings.fontFamily;
    this.setReadingMode(this.settings.readingMode);
  }

  handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
    this.touchStartTime = Date.now();
  }

  handleTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;
    
    // 素早いスワイプのみページ送り（通常のスクロールは許可）
    // 150ms以内で100px以上の横移動
    if (dt < 150 && Math.abs(dx) > 100 && Math.abs(dx) > Math.abs(dy) * 2) {
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
