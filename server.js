const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = 3000;

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

// HTTPSリクエスト（User-Agent付き、gzip対応）
function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    };

    https.get(targetUrl, options, (res) => {
      // リダイレクト対応
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve).catch(reject);
        return;
      }

      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (res.headers['content-encoding'] === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (res.headers['content-encoding'] === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      let data = '';
      stream.on('data', chunk => data += chunk);
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    }).on('error', reject);
  });
}

// 小説本文を取得
async function fetchChapterContent(ncode, chapterNum) {
  const chapterUrl = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
  console.log(`Fetching: ${chapterUrl}`);
  
  const data = await httpsGet(chapterUrl);
  
  // タイトル抽出（複数パターン対応）
  let title = `第${chapterNum}話`;
  const titlePatterns = [
    /<p class="novel_subtitle">([^<]+)<\/p>/,
    /<h1 class="p-novel__title[^"]*">([^<]+)<\/h1>/,
    /<title>([^<]+)<\/title>/
  ];
  for (const pattern of titlePatterns) {
    const match = data.match(pattern);
    if (match) {
      title = match[1].trim().replace(/ - 小説家になろう$/, '');
      break;
    }
  }

  // 本文抽出（複数パターン対応）
  let content = '';
  const contentPatterns = [
    /<div id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/,
    /<div class="p-novel__body"[^>]*>([\s\S]*?)<\/div>/,
    /<div class="novel_view"[^>]*>([\s\S]*?)<\/div>/
  ];
  
  for (const pattern of contentPatterns) {
    const match = data.match(pattern);
    if (match) {
      content = match[1];
      break;
    }
  }

  if (!content) {
    console.log('Content not found. HTML sample:', data.substring(0, 2000));
    throw new Error('本文が見つかりません');
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
  content = content.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));

  const paragraphs = content.split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return { title, content: paragraphs };
}

// 小説情報を取得
async function fetchNovelInfo(ncode) {
  const apiUrl = `${NAROU_API}?of=t-w-s-ga&ncode=${ncode}&out=json`;
  console.log(`Fetching info: ${apiUrl}`);
  
  const data = await httpsGet(apiUrl);
  const json = JSON.parse(data);
  
  if (json.length > 1) {
    return json[1];
  }
  throw new Error('小説が見つかりません');
}

// 目次を取得
async function fetchTableOfContents(ncode) {
  const tocUrl = `https://ncode.syosetu.com/${ncode}/`;
  console.log(`Fetching TOC: ${tocUrl}`);
  
  const data = await httpsGet(tocUrl);
  const chapters = [];
  const sections = [];
  
  // 章（セクション）タイトルを抽出
  const chapterTitleRegex = /<div class="chapter_title">([^<]+)<\/div>/g;
  let chapterMatch;
  while ((chapterMatch = chapterTitleRegex.exec(data)) !== null) {
    sections.push({
      title: chapterMatch[1].trim(),
      index: chapterMatch.index
    });
  }
  
  // 各話のリンクを抽出（複数パターン）
  const patterns = [
    /<a href="\/[^/]+\/(\d+)\/"[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]+)<\/a>/g,
    /<a href="\/[^/]+\/(\d+)\/"[^>]*>([^<]+)<\/a>/g,
    /<dd class="subtitle">\s*<a href="\/[^/]+\/(\d+)\/">([^<]+)<\/a>/g
  ];
  
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(data)) !== null) {
      const num = parseInt(match[1]);
      if (!chapters.find(c => c.number === num)) {
        // この話がどの章に属するか判定
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
      }
    }
  }

  // 番号順にソート
  chapters.sort((a, b) => a.number - b.number);

  // 短編の場合
  if (chapters.length === 0) {
    chapters.push({ number: 1, title: '本編', section: null });
  }

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

server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
