// Groq AI機能
const ChatGPTAI = {
  apiKey: null,
  context: [],
  maxContextChapters: 5,

  init() {
    this.apiKey = localStorage.getItem('groqApiKey') || null;
    this.updateUI();
  },

  setApiKey(key) {
    this.apiKey = key;
    if (key) {
      localStorage.setItem('groqApiKey', key);
    } else {
      localStorage.removeItem('groqApiKey');
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
    
    // システムメッセージ
    this.context.push({
      role: 'system',
      content: `あなたは小説「${novel.title}」（作者: ${novel.author}）の読書アシスタントです。

重要なルール：
- 提供された小説の内容のみに基づいて回答してください
- 知らない情報や提供されていない情報については「その情報は提供されていません」と正直に答えてください
- 絶対に創作や推測で情報を補完しないでください
- 登場人物や設定について聞かれた場合、提供されたテキストに明記されている情報のみを答えてください
- 日本語で回答してください`
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
        content: contextText
      });
      this.context.push({
        role: 'assistant',
        content: '内容を確認しました。質問をどうぞ。'
      });
    }
  },

  async chat(message) {
    if (!this.apiKey) {
      return { error: 'APIキーが設定されていません' };
    }

    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    // コンテキストに新しいメッセージを追加
    const messages = [
      ...this.context,
      { role: 'user', content: message }
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.3,
          max_tokens: 2048
        })
      });

      if (!response.ok) {
        const err = await response.json();
        if (response.status === 401) {
          return { error: 'APIキーが無効です' };
        }
        if (response.status === 429) {
          return { error: 'レート制限に達しました。しばらく待ってから再試行してください。' };
        }
        return { error: err.error?.message || 'APIエラー' };
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '応答がありません';
      
      // 会話履歴に追加
      this.context.push({ role: 'user', content: message });
      this.context.push({ role: 'assistant', content: reply });
      
      // 履歴が長くなりすぎたら古いものを削除（システムメッセージは保持）
      if (this.context.length > 20) {
        this.context = [this.context[0], ...this.context.slice(-10)];
      }

      return { reply };
    } catch (e) {
      console.error('Groq error:', e);
      return { error: 'ネットワークエラー' };
    }
  },

  clearHistory() {
    // システムメッセージは保持
    this.context = this.context.slice(0, 1);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ChatGPTAI.init();
});
