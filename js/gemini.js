// Gemini AI機能
const GeminiAI = {
  apiKey: null,
  context: [],
  maxContextChapters: 5,

  init() {
    this.apiKey = localStorage.getItem('geminiApiKey') || null;
    this.updateUI();
  },

  setApiKey(key) {
    this.apiKey = key;
    if (key) {
      localStorage.setItem('geminiApiKey', key);
    } else {
      localStorage.removeItem('geminiApiKey');
    }
    this.updateUI();
  },

  updateUI() {
    const aiPanel = document.getElementById('ai-panel');
    const aiKeyInput = document.getElementById('ai-key-input');
    const aiChat = document.getElementById('ai-chat');
    
    if (this.apiKey) {
      aiKeyInput.classList.add('hidden');
      aiChat.classList.remove('hidden');
    } else {
      aiKeyInput.classList.remove('hidden');
      aiChat.classList.add('hidden');
    }
  },

  // 小説のコンテキストを設定
  setNovelContext(novel, currentChapter, chapters) {
    this.context = [];
    
    if (!novel) return;
    
    // 小説の基本情報
    this.context.push({
      role: 'user',
      parts: [{ text: `あなたは小説「${novel.title}」（作者: ${novel.author}）の読書アシスタントです。読者の質問に答えたり、内容を要約したり、考察を手伝ってください。` }]
    });
    this.context.push({
      role: 'model',
      parts: [{ text: `はい、「${novel.title}」についてお手伝いします。内容について質問があればお聞きください。` }]
    });

    // 現在読んでいる章の前後を含める
    const startIdx = Math.max(0, currentChapter - 2);
    const endIdx = Math.min(chapters.length, currentChapter + 3);
    
    let contextText = '【これまでの内容】\n';
    for (let i = startIdx; i < endIdx; i++) {
      if (chapters[i]?.content) {
        const title = novel.chapters[i]?.title || `第${i + 1}話`;
        // 長すぎる場合は要約用に切り詰め
        const content = chapters[i].content.substring(0, 3000);
        contextText += `\n--- ${title} ---\n${content}\n`;
      }
    }

    if (contextText.length > 100) {
      this.context.push({
        role: 'user',
        parts: [{ text: contextText }]
      });
      this.context.push({
        role: 'model',
        parts: [{ text: '内容を確認しました。質問をどうぞ。' }]
      });
    }
  },

  async chat(message) {
    if (!this.apiKey) {
      return { error: 'APIキーが設定されていません' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
    
    // コンテキストに新しいメッセージを追加
    const contents = [
      ...this.context,
      { role: 'user', parts: [{ text: message }] }
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        if (response.status === 400 && err.error?.message?.includes('API key')) {
          return { error: 'APIキーが無効です' };
        }
        return { error: err.error?.message || 'APIエラー' };
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '応答がありません';
      
      // 会話履歴に追加
      this.context.push({ role: 'user', parts: [{ text: message }] });
      this.context.push({ role: 'model', parts: [{ text: reply }] });
      
      // 履歴が長くなりすぎたら古いものを削除（最初の2つは保持）
      if (this.context.length > 20) {
        this.context = this.context.slice(0, 4).concat(this.context.slice(-10));
      }

      return { reply };
    } catch (e) {
      console.error('Gemini error:', e);
      return { error: 'ネットワークエラー' };
    }
  },

  clearHistory() {
    // 最初のコンテキスト設定は保持
    this.context = this.context.slice(0, 4);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  GeminiAI.init();
});
