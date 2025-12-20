// リーダークラス
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
      currentPage: document.getElementById('current-page'),
      totalPages: document.getElementById('total-pages'),
      loading: document.getElementById('loading')
    };
    this.touchStartX = 0;
    this.touchEndX = 0;
  }

  showLoading() {
    this.elements.loading.classList.remove('hidden');
  }

  hideLoading() {
    this.elements.loading.classList.add('hidden');
  }

  extractNcode(input) {
    input = input.trim();
    const urlMatch = input.match(/ncode\.syosetu\.com\/([^\/]+)/);
    if (urlMatch) {
      return urlMatch[1].toLowerCase();
    }
    if (/^n\d+[a-z]+$/i.test(input)) {
      return input.toLowerCase();
    }
    return null;
  }

  async loadFromNarou(input) {
    const ncode = this.extractNcode(input);
    if (!ncode) {
      alert('無効なURLまたはncodeです\n例: n9669bk または https://ncode.syosetu.com/n9669bk/');
      return;
    }

    this.showLoading();
    try {
      const response = await fetch(`/api/novel?ncode=${ncode}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '小説情報の取得に失敗しました');
      }
      
      this.novel = await response.json();
      this.elements.title.textContent = this.novel.title;
      this.buildToc();
      this.showNovelInfo();
      
      const progress = Settings.getProgress(ncode);
      await this.goToChapter(progress.chapterIndex || 0);
      
    } catch (error) {
      console.error(error);
      alert('読み込みに失敗しました: ' + error.message);
    } finally {
      this.hideLoading();
    }
  }

  showNovelInfo() {
    if (!this.novel) return;
    
    let storyHtml = '';
    if (this.novel.story) {
      const story = this.novel.story.length > 200 
        ? this.novel.story.substring(0, 200) + '...' 
        : this.novel.story;
      storyHtml = `<div class="info-story">${this.escapeHtml(story)}</div>`;
    }
    
    this.elements.novelInfo.innerHTML = `
      <div class="info-title">${this.escapeHtml(this.novel.title)}</div>
      <div class="info-author">作者: ${this.escapeHtml(this.novel.author)}</div>
      <div class="info-chapters">全${this.novel.totalChapters}話</div>
      ${storyHtml}
    `;
  }

  buildToc() {
    let html = '';
    let currentSection = null;
    
    this.novel.chapters.forEach((ch, i) => {
      // セクション（章）が変わったら見出しを追加
      if (ch.section && ch.section !== currentSection) {
        currentSection = ch.section;
        html += `<div class="toc-section">${this.escapeHtml(currentSection)}</div>`;
      }
      html += `<a href="#" data-chapter="${i}" title="${this.escapeHtml(ch.title)}">${ch.number}. ${this.escapeHtml(ch.title)}</a>`;
    });
    
    this.elements.toc.innerHTML = html;
  }

  async goToChapter(index) {
    if (!this.novel || index < 0 || index >= this.novel.chapters.length) return;
    
    this.showLoading();
    this.currentChapter = index;
    const chapter = this.novel.chapters[index];
    
    try {
      const response = await fetch(`/api/chapter?ncode=${this.novel.id}&chapter=${chapter.number}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '本文の取得に失敗しました');
      }
      
      const data = await response.json();
      
      const html = `
        <h2 class="chapter-title">${this.escapeHtml(data.title)}</h2>
        ${data.content.map(p => `<p>${this.escapeHtml(p)}</p>`).join('')}
        <div class="chapter-nav">
          <button id="prev-chapter" ${index === 0 ? 'disabled' : ''}>← 前の話</button>
          <button id="next-chapter" ${index >= this.novel.chapters.length - 1 ? 'disabled' : ''}>次の話 →</button>
        </div>
      `;
      this.elements.content.innerHTML = html;
      
      document.getElementById('prev-chapter')?.addEventListener('click', () => this.goToChapter(index - 1));
      document.getElementById('next-chapter')?.addEventListener('click', () => this.goToChapter(index + 1));
      
      // 目次のアクティブ状態を更新
      document.querySelectorAll('#toc a').forEach((a, i) => {
        a.classList.toggle('active', i === index);
      });
      
      // スクロール位置をリセット
      this.elements.reader.scrollLeft = 0;
      this.elements.reader.scrollTop = 0;
      this.elements.content.scrollTop = 0;
      this.elements.content.scrollLeft = 0;
      
      Settings.saveProgress(this.novel.id, index, 0);
      this.updatePageIndicator();
      
    } catch (error) {
      console.error(error);
      this.elements.content.innerHTML = `<p>読み込みに失敗しました: ${error.message}</p>`;
    } finally {
      this.hideLoading();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  nextChapter() {
    if (this.currentChapter < this.novel.chapters.length - 1) {
      this.goToChapter(this.currentChapter + 1);
    }
  }

  prevChapter() {
    if (this.currentChapter > 0) {
      this.goToChapter(this.currentChapter - 1);
    }
  }

  nextPage() {
    const content = this.elements.content;
    const isVertical = this.settings.readingMode === 'vertical';
    
    if (isVertical) {
      const scrollAmount = content.clientWidth * 0.8;
      content.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      const scrollAmount = content.clientHeight * 0.9;
      content.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
    
    setTimeout(() => this.updatePageIndicator(), 300);
  }

  prevPage() {
    const content = this.elements.content;
    const isVertical = this.settings.readingMode === 'vertical';
    
    if (isVertical) {
      const scrollAmount = content.clientWidth * 0.8;
      content.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else {
      const scrollAmount = content.clientHeight * 0.9;
      content.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    }
    
    setTimeout(() => this.updatePageIndicator(), 300);
  }

  updatePageIndicator() {
    const content = this.elements.content;
    const isVertical = this.settings.readingMode === 'vertical';
    
    let current, total;
    if (isVertical) {
      const scrollWidth = content.scrollWidth - content.clientWidth;
      const scrollLeft = Math.abs(content.scrollLeft);
      total = Math.max(1, Math.ceil(scrollWidth / content.clientWidth) + 1);
      current = Math.min(total, Math.floor(scrollLeft / content.clientWidth) + 1);
    } else {
      const scrollHeight = content.scrollHeight - content.clientHeight;
      total = Math.max(1, Math.ceil(scrollHeight / content.clientHeight) + 1);
      current = Math.min(total, Math.floor(content.scrollTop / content.clientHeight) + 1);
    }
    
    this.elements.currentPage.textContent = current || 1;
    this.elements.totalPages.textContent = total || 1;
  }

  setReadingMode(mode) {
    this.settings.readingMode = mode;
    Settings.update('readingMode', mode);
    
    const reader = this.elements.reader;
    reader.classList.remove('horizontal-mode', 'vertical-mode');
    reader.classList.add(`${mode}-mode`);
    
    this.elements.content.scrollLeft = 0;
    this.elements.content.scrollTop = 0;
    
    setTimeout(() => this.updatePageIndicator(), 100);
  }

  setFontSize(size) {
    this.settings.fontSize = size;
    Settings.update('fontSize', size);
    this.elements.content.style.fontSize = `${size}px`;
    setTimeout(() => this.updatePageIndicator(), 100);
  }

  setLineHeight(height) {
    this.settings.lineHeight = height;
    Settings.update('lineHeight', height);
    this.elements.content.style.lineHeight = height;
    setTimeout(() => this.updatePageIndicator(), 100);
  }

  setFontFamily(family) {
    this.settings.fontFamily = family;
    Settings.update('fontFamily', family);
    this.elements.content.style.fontFamily = family;
    setTimeout(() => this.updatePageIndicator(), 100);
  }

  applySettings() {
    this.elements.content.style.fontSize = `${this.settings.fontSize}px`;
    this.elements.content.style.lineHeight = this.settings.lineHeight;
    this.elements.content.style.fontFamily = this.settings.fontFamily;
    this.setReadingMode(this.settings.readingMode);
  }

  handleTouchStart(e) {
    this.touchStartX = e.changedTouches[0].screenX;
  }

  handleTouchEnd(e) {
    this.touchEndX = e.changedTouches[0].screenX;
    this.handleSwipe();
  }

  handleSwipe() {
    const diff = this.touchStartX - this.touchEndX;
    const threshold = 50;
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        this.nextPage();
      } else {
        this.prevPage();
      }
    }
  }
}
