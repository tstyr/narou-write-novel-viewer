const https = require('https');
const http = require('http');

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja'
      }
    };

    const req = client.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('タイムアウト'));
    });
    req.end();
  });
}

async function fetchChapterContent(ncode, chapterNum) {
  const url = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
  
  const data = await fetchUrl(url);
  
  // エラーチェック
  if (data.includes('Checking your browser') || data.includes('Just a moment')) {
    throw new Error('Cloudflareにブロックされました。ローカル実行をお試しください。');
  }
  
  if (data.includes('ページが見つかりません') || data.includes('404')) {
    throw new Error('ページが見つかりません');
  }

  // タイトル抽出
  let title = `第${chapterNum}話`;
  const titleMatch = data.match(/<p class="novel_subtitle">([^<]+)<\/p>/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // 本文抽出
  const contentMatch = data.match(/<div id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/);
  if (!contentMatch) {
    // デバッグ用にHTMLの一部を返す
    const sample = data.substring(0, 1000);
    throw new Error(`本文が見つかりません。HTML: ${sample.substring(0, 200)}`);
  }

  let content = contentMatch[1];
  
  // HTMLタグを処理
  content = content.replace(/<ruby>([^<]*)<rt>([^<]*)<\/rt><\/ruby>/gi, '$1');
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<p[^>]*>/gi, '');
  content = content.replace(/<\/p>/gi, '\n');
  content = content.replace(/<[^>]+>/g, '');
  content = content.replace(/&nbsp;/g, ' ');
  content = content.replace(/&lt;/g, '<');
  content = content.replace(/&gt;/g, '>');
  content = content.replace(/&amp;/g, '&');
  content = content.replace(/&quot;/g, '"');
  content = content.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));

  const paragraphs = content.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    throw new Error('本文が空です');
  }

  return { title, content: paragraphs };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { ncode, chapter } = req.query;
  if (!ncode || !chapter) {
    return res.status(400).json({ error: 'ncodeとchapterが必要です' });
  }

  try {
    const content = await fetchChapterContent(ncode.toLowerCase(), chapter);
    return res.status(200).json(content);
  } catch (error) {
    console.error('Chapter fetch error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
