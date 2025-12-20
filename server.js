const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const NAROU_API = 'https://api.syosetu.com/novelapi/api/';

// HTTPSリクエスト
function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode} for ${targetUrl}`);
      
      // リダイレクト対応
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = `https://${parsedUrl.hostname}${redirectUrl}`;
        }
        httpsGet(redirectUrl).then(resolve).catch(reject);
        return;
      }

      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('utf-8'));
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

// 小説本文を取得
async function fetchChapterContent(ncode, chapterNum) {
  const chapterUrl = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
  console.log(`Fetching chapter: ${chapterUrl}`);
  
  const data = await httpsGet(chapterUrl);
  console.log(`Received ${data.length} bytes`);
  
  // エラーページチェック
  if (data.includes('The page could not be found') || data.includes('ページが見つかりません')) {
    throw new Error('ページが見つかりません');
  }
  
  // タイトル抽出
  let title = `第${chapterNum}話`;
  const titlePatterns = [
    /<p class="novel_subtitle">([^<]+)<\/p>/,
    /<h1[^>]*class="[^"]*novel[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<title>([^<|]+)/
  ];
  for (const pattern of titlePatterns) {
    const match = data.match(pattern);
    if (match) {
      title = match[1].trim();
      break;
    }
  }

  // 本文抽出
  let content = '';
  const contentPatterns = [
    /<div id="novel_honbun"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<script|$)/,
    /<div class="p-novel__body"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*novel_view[^"]*"[^>]*>([\s\S]*?)<\/div>/
  ];
  
  for (const pattern of contentPatterns) {
    const match = data.match(pattern);
    if (match) {
      content = match[1];
      break;
    }
  }

  if (!content) {
    // デバッグ用
    console.log('=== HTML Sample ===');
    console.log(data.substring(0, 3000));
    console.log('===================');
    throw new Error('本文が見つかりません。サイト構造が変更された可能性があります。');
  }

  // HTMLタグを処理
  content = content.replace(/<ruby>([^<]*)<rb>([^<]*)<\/rb><rp>[^<]*<\/rp><rt>([^<]*)<\/rt><rp>[^<]*<\/rp><\/ruby>/gi, '$2');
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

  const paragraphs = content.split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return { title, content: paragraphs };
}

// 小説情報を取得（公式API使用）
async function fetchNovelInfo(ncode) {
  const apiUrl = `${NAROU_API}?of=t-w-s-ga&ncode=${ncode}&out=json`;
  console.log(`Fetching info: ${apiUrl}`);
  
  const data = await httpsGet(apiUrl);
  console.log(`API response: ${data.substring(0, 200)}`);
  
  try {
    const json = JSON.parse(data);
    if (json.length > 1) {
      return json[1];
    }
  } catch (e) {
    console.error('JSON parse error:', e.message);
    console.log('Raw data:', data.substring(0, 500));
  }
  throw new Error('小説が見つかりません');
}

// 目次を取得（全ページ対応）
async function fetchTableOfContents(ncode) {
  const chapters = [];
  const sections = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const tocUrl = page === 1 
      ? `https://ncode.syosetu.com/${ncode}/`
      : `https://ncode.syosetu.com/${ncode}/?p=${page}`;
    console.log(`Fetching TOC page ${page}: ${tocUrl}`);
    
    const data = await httpsGet(tocUrl);
    console.log(`TOC page ${page} received ${data.length} bytes`);
    
    // 章タイトルを抽出
    const chapterTitleRegex = /<div class="chapter_title">([^<]+)<\/div>/g;
    let chapterMatch;
    while ((chapterMatch = chapterTitleRegex.exec(data)) !== null) {
      const title = chapterMatch[1].trim();
      if (!sections.find(s => s.title === title)) {
        sections.push({
          title: title,
          index: chapterMatch.index
        });
      }
    }
    
    // 各話のリンクを抽出
    const regex = /<a href="\/[^/]+\/(\d+)\/"[^>]*>([^<]+)<\/a>/g;
    let match;
    let foundInPage = 0;
    while ((match = regex.exec(data)) !== null) {
      const num = parseInt(match[1]);
      // 重複チェック & 数字のみのリンクを除外
      if (!chapters.find(c => c.number === num) && match[2].trim().length > 0) {
        let sectionTitle = null;
        for (let i = sections.length - 1; i >= 0; i--) {
          if (sections[i].index < match.index) {
            sectionTitle = sections[i].title;
            break;
          }
        }
        chapters.push({
          number: num,
          title: match[2].trim(),
          section: sectionTitle
        });
        foundInPage++;
      }
    }
    
    // 次のページがあるかチェック
    const nextPageMatch = data.match(/<a[^>]*href="[^"]*\?p=(\d+)"[^>]*>次へ/);
    if (nextPageMatch && foundInPage > 0) {
      page++;
      // 安全のため最大20ページまで
      if (page > 20) {
        console.log('Max pages reached');
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  chapters.sort((a, b) => a.number - b.number);

  // 短編の場合
  if (chapters.length === 0) {
    chapters.push({ number: 1, title: '本編', section: null });
  }

  console.log(`Found ${chapters.length} chapters total`);
  return { chapters, sections: [...new Set(sections.map(s => s.title))] };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: 小説情報取得
  if (pathname === '/api/novel') {
    const ncode = parsedUrl.query.ncode;
    if (!ncode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ncodeが必要です' }));
      return;
    }

    try {
      const [info, tocData] = await Promise.all([
        fetchNovelInfo(ncode),
        fetchTableOfContents(ncode)
      ]);
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        id: ncode,
        title: info.title,
        author: info.writer,
        story: info.story,
        totalChapters: info.general_all_no || tocData.chapters.length,
        chapters: tocData.chapters,
        sections: tocData.sections
      }));
    } catch (error) {
      console.error('Error fetching novel:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // API: 章の本文取得
  if (pathname === '/api/chapter') {
    const ncode = parsedUrl.query.ncode;
    const chapter = parsedUrl.query.chapter;
    
    if (!ncode || !chapter) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ncodeとchapterが必要です' }));
      return;
    }

    try {
      const content = await fetchChapterContent(ncode, chapter);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(content));
    } catch (error) {
      console.error('Error fetching chapter:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // 静的ファイル配信
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
