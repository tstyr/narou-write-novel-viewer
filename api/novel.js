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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
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
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
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

// なろうAPI（これはブロックされない）
async function fetchNovelInfo(ncode) {
  const apiUrl = `${NAROU_API}?of=t-w-s-ga&ncode=${ncode}&out=json`;
  const data = await httpsGet(apiUrl);
  
  try {
    const json = JSON.parse(data);
    if (json.length > 1) return json[1];
  } catch (e) {
    console.error('API parse error:', data.substring(0, 500));
  }
  throw new Error('小説が見つかりません');
}

// 目次はAPIから話数を取得して生成
async function generateToc(ncode, totalChapters) {
  const chapters = [];
  for (let i = 1; i <= totalChapters; i++) {
    chapters.push({
      number: i,
      title: `第${i}話`,
      section: null
    });
  }
  return { chapters, sections: [] };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { ncode } = req.query;
  if (!ncode) {
    return res.status(400).json({ error: 'ncodeが必要です' });
  }

  try {
    const info = await fetchNovelInfo(ncode.toLowerCase());
    const totalChapters = info.general_all_no || 1;
    const tocData = await generateToc(ncode, totalChapters);
    
    res.status(200).json({
      id: ncode.toLowerCase(),
      title: info.title,
      author: info.writer,
      story: info.story,
      totalChapters: totalChapters,
      chapters: tocData.chapters,
      sections: tocData.sections
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
