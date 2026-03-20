const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * gyeongsu-cyber-guardian logic: Evidence Acquisition for YouTube.
 */
class YoutubeService {
    constructor() {
        this.browser = null;
        this.evidenceDir = path.join(process.cwd(), 'evidence');
        if (!fs.existsSync(this.evidenceDir)) fs.mkdirSync(this.evidenceDir);
    }

    async init() {
        if (!this.browser) {
            const launchOptions = {
                headless: true,
                // Railway(Linux) 컨테이너 필수 옵션
                executablePath: process.env.CHROME_PATH || puppeteer.executablePath(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-blink-features=AutomationControlled'
                ]
            };
            try {
                this.browser = await puppeteer.launch(launchOptions);
                console.log('[YouTube] Browser launched successfully.');
            } catch (err) {
                console.error('[YouTube] Failed to launch browser:', err.message);
                this.browser = null;
                throw err; // patrolVideo/patrolChannel의 try/catch로 전파
            }
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Patrols a YouTube video URL and captures malicious comments.
     */
    async patrolVideo(videoUrl, targetAuthors = [], targetChannelIds = []) {
        await this.init();
        const page = await this.browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1600 });
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            console.log(`[YouTube] Patrol start: ${videoUrl}`);
            await page.goto(videoUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll down to trigger comment loading
            console.log('[YouTube] Scrolling to load comments...');
            await page.evaluate(() => window.scrollBy(0, 800));
            
            // Wait for comments container
            try {
                await page.waitForSelector('ytd-comment-thread-renderer', { timeout: 15000 });
            } catch (e) {
                console.log('[YouTube] No comments loaded or found within timeout.');
                return [];
            }

            // Scroll a bit more to load more comments if needed
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 2000));

            const commentElements = await page.$$('ytd-comment-thread-renderer');
            console.log(`[YouTube] Detecting ${commentElements.length} candidate comments.`);

            const incidents = [];
            const normalize = (val) => (val || '').trim().replace(/^@/, '').toLowerCase();

            const targetAuthorsNorm = targetAuthors.map(normalize);

            for (const el of commentElements) {
                const data = await page.evaluate((commentThread) => {
                    const authorEl = commentThread.querySelector('#author-text');
                    const textEl = commentThread.querySelector('#content-text');
                    const authorName = authorEl ? authorEl.innerText.trim() : '';
                    const authorLink = authorEl ? authorEl.href : '';
                    const commentText = textEl ? textEl.innerText.trim() : '';
                    
                    return { authorName, authorLink, commentText };
                }, el);

                if (!data.authorName) continue;

                const authorNorm = normalize(data.authorName);
                const isTargetAuthor = targetAuthorsNorm.includes(authorNorm);
                
                // For now, focusing on author name matches. Channel ID check can be added if authorLink is expanded.
                let shouldCapture = isTargetAuthor;

                if (shouldCapture) {
                    console.log(`🚨 [YouTube] MATCH IDENTIFIED: comment by @${data.authorName}`);
                    
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                    const filename = `youtube_comment_${authorNorm}_${ts}.png`;
                    const screenshotPath = path.join(this.evidenceDir, filename);

                    await el.screenshot({ path: screenshotPath }).catch((e) => console.error('[YouTube] Screenshot failed:', e.message));
                    
                    incidents.push({
                        type: 'youtube-comment',
                        author: data.authorName,
                        text: data.commentText,
                        link: videoUrl,
                        screenshotPath,
                        stableId: `yt_comment_${authorNorm}_${data.commentText.substring(0, 20)}`
                    });
                }
            }

            return incidents;

        } catch (err) {
            console.error('[YouTube] Patrol error:', err.message);
            return [];
        } finally {
            await page.close();
        }
    }

    /**
     * Patrols a channel to find recently uploaded videos.
     */
    async patrolChannel(channelIdOrHandle) {
        await this.init();
        const page = await this.browser.newPage();
        
        try {
            const url = channelIdOrHandle.startsWith('UC') 
                ? `https://www.youtube.com/channel/${channelIdOrHandle}/videos`
                : `https://www.youtube.com/${channelIdOrHandle.startsWith('@') ? '' : '@'}${channelIdOrHandle}/videos`;
            
            console.log(`[YouTube] Scanning channel for videos: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            const videoLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a#video-title-link'));
                return links.slice(0, 5).map(l => l.href); // Get top 5 recent videos
            });

            console.log(`[YouTube] Found ${videoLinks.length} recent videos.`);
            return videoLinks;

        } catch (err) {
            console.error('[YouTube] Channel patrol error:', err.message);
            return [];
        } finally {
            await page.close();
        }
    }
}

module.exports = new YoutubeService();
