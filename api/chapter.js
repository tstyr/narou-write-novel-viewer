const https = require('https');
const zlib = require('zlib');

function httpsGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = `https://${parsedUrl.hostname}${redirectUrl}`;
        }
        httpsGet(redirectUrl).then(resolve).catch(reject);
        return;
      }

      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (res.headers['content-encoding'] === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchChapterContent(ncode, chapterNum) {
  const chapterUrl = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
  const data = await httpsGet(chapterUrl);
  
  if (data.includes('The page could not be found')) {
    throw new Error('ページが見つかりません');
  }
  
  let title = `第${chapterNum}話`;
  const titlePatterns = [
    /<p class="novel_subtitle">([^<]+)<\/p>/,
    /<title>([^<|]+)/
  ];
  for (const pattern of titlePatterns) {
    const match = data.match(pattern);
    if (match) {
      title = match[1].trim();
      break;
    }
  }

  let content = '';
  const contentPatterns = [
    /<div id="novel_honbun"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<script|$)/,
    /<div class="p-novel__body"[^>]*>([\s\S]*?)<\/div>/
  ];
  
  for (const pattern of contentPatterns) {
    const match = data.match(pattern);
    if (match) {
      content = match[1];
      break;
    }
  }

  if (!content) {
    throw new Error('本文が見つかりません');
  }

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

  const paragraphs = content.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  return { title, content: paragraphs };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { ncode, chapter } = req.query;
  if (!ncode || !chapter) {
    return res.status(400).json({ error: 'ncodeとchapterが必要です' });
  }

  try {
    const content = await fetchChapterContent(ncode, chapter);
    res.status(200).json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
