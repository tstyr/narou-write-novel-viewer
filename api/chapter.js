const chromium = require('@sparticuz/chromium-min');
const puppeteer = require('puppeteer-core');

async function getBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(
      'https://github.com/nicholaschiang/chromium/releases/download/v123.0.0/chromium-v123.0.0-pack.tar'
    ),
    headless: chromium.headless,
  });
}

async function fetchChapterContent(ncode, chapterNum) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const url = `https://ncode.syosetu.com/${ncode}/${chapterNum}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Cloudflareチャレンジを待つ
    await page.waitForSelector('#novel_honbun', { timeout: 15000 }).catch(() => {});
    
    const result = await page.evaluate(() => {
      const titleEl = document.querySelector('.novel_subtitle');
      const contentEl = document.querySelector('#novel_honbun');
      
      if (!contentEl) return null;
      
      const title = titleEl ? titleEl.textContent.trim() : '本文';
      const paragraphs = [];
      
      contentEl.querySelectorAll('p').forEach(p => {
        const text = p.textContent.trim();
        if (text) paragraphs.push(text);
      });
      
      return { title, content: paragraphs };
    });
    
    if (!result || result.content.length === 0) {
      throw new Error('本文が見つかりません');
    }
    
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
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
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
