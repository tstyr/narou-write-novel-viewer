const https = require('https');
const zlib = require('zlib');

const NAROU_API = 'https://api.syosetu.com/novelapi/api/';

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

async function fetchNovelInfo(ncode) {
  const apiUrl = `${NAROU_API}?of=t-w-s-ga&ncode=${ncode}&out=json`;
  const data = await httpsGet(apiUrl);
  const json = JSON.parse(data);
  if (json.length > 1) return json[1];
  throw new Error('小説が見つかりません');
}

async function fetchTableOfContents(ncode) {
  const chapters = [];
  const sections = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const tocUrl = page === 1 
      ? `https://ncode.syosetu.com/${ncode}/`
      : `https://ncode.syosetu.com/${ncode}/?p=${page}`;
    
    const data = await httpsGet(tocUrl);
    
    // 章タイトルを抽出
    const chapterTitleRegex = /<div class="chapter_title">([^<]+)<\/div>/g;
    let chapterMatch;
    while ((chapterMatch = chapterTitleRegex.exec(data)) !== null) {
      const title = chapterMatch[1].trim();
      if (!sections.find(s => s.title === title)) {
        sections.push({ title: title, index: chapterMatch.index });
      }
    }
    
    // 各話のリンクを抽出
    const regex = /<a href="\/[^/]+\/(\d+)\/"[^>]*>([^<]+)<\/a>/g;
    let match;
    let foundInPage = 0;
    while ((match = regex.exec(data)) !== null) {
      const num = parseInt(match[1]);
      if (!chapters.find(c => c.number === num) && match[2].trim().length > 0) {
        let sectionTitle = null;
        for (let i = sections.length - 1; i >= 0; i--) {
          if (sections[i].index < match.index) {
            sectionTitle = sections[i].title;
            break;
          }
        }
        chapters.push({ number: num, title: match[2].trim(), section: sectionTitle });
        foundInPage++;
      }
    }
    
    // 次のページがあるかチェック
    const nextPageMatch = data.match(/<a[^>]*href="[^"]*\?p=(\d+)"[^>]*>次へ/);
    if (nextPageMatch && foundInPage > 0) {
      page++;
      if (page > 20) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  chapters.sort((a, b) => a.number - b.number);
  if (chapters.length === 0) chapters.push({ number: 1, title: '本編', section: null });

  return { chapters, sections: [...new Set(sections.map(s => s.title))] };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { ncode } = req.query;
  if (!ncode) {
    return res.status(400).json({ error: 'ncodeが必要です' });
  }

  try {
    const [info, tocData] = await Promise.all([
      fetchNovelInfo(ncode),
      fetchTableOfContents(ncode)
    ]);
    
    res.status(200).json({
      id: ncode,
      title: info.title,
      author: info.writer,
      story: info.story,
      totalChapters: info.general_all_no || tocData.chapters.length,
      chapters: tocData.chapters,
      sections: tocData.sections
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
