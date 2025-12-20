const https = require('https');
const zlib = require('zlib');

function httpsGet(targetUrl, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = `https://${parsedUrl.hostname}${redirectUrl}`;
        }
        httpsGet(redirectUrl, encoding).then(resolve).catch(reject);
        return;
      }

      let stream = res;
      const enc = res.headers['content-encoding'];
      if (enc === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (enc === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (enc === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchChapterContent(ncode, chapterNum) {
  // 方法1: 通常のページから取得を試みる
  const chapterUrl = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
  
  try {
    const data = await httpsGet(chapterUrl);
    
    // Cloudflareブロックチェック
    if (data.includes('Checking your browser') || 
        data.includes('cf-browser-verification') ||
        data.includes('Just a moment')) {
      throw new Error('BLOCKED');
    }
    
    let title = `第${chapterNum}話`;
    const titleMatch = data.match(/<p class="novel_subtitle">([^<]+)<\/p>/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    let content = '';
    const contentMatch = data.match(/<div id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/);
    if (contentMatch) {
      content = contentMatch[1];
    }

    if (content) {
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
      return { title, content: paragraphs };
    }
  } catch (e) {
    console.log('Direct fetch failed:', e.message);
  }

  // 方法2: テキストダウンロードAPI（なろうの公式機能）
  // 注意: これは1話ずつではなく全話一括なので、大きい作品では使えない
  
  // 方法3: 別のプロキシを使う（将来的な拡張用）
  
  throw new Error('現在、小説家になろうのサイトにアクセスできません。しばらく時間をおいて再度お試しください。');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { ncode, chapter } = req.query;
  if (!ncode || !chapter) {
    return res.status(400).json({ error: 'ncodeとchapterが必要です' });
  }

  try {
    const content = await fetchChapterContent(ncode.toLowerCase(), chapter);
    res.status(200).json(content);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
