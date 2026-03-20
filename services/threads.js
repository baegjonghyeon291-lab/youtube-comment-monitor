const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cookieService = require('./cookies');

/**
 * gyeongsu-cyber-guardian logic: Evidence Acquisition.
 */
class ThreadsService {
    constructor() {
        this.browser = null;
        this.evidenceDir = path.join(process.cwd(), 'evidence');
        if (!fs.existsSync(this.evidenceDir)) fs.mkdirSync(this.evidenceDir);
    }

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled'
                ]
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Patrols a target profile and captures relevant activities.
     */
    async patrolProfile(targetUsername, sectionType = 'post') {
        await this.init();
        const page = await this.browser.newPage();
        
        // Investigator Stealth: Resemble a real browser
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1600 });
        
        // Stealth: Bypass navigator.webdriver detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });


        try {
            /* 
             * [Mission Note] Manual cookie injection currently triggers a 'Page not found' (404) 
             * security redirect on Threads. Guest-mode Stealth is currently more resilient.
             * 
            const cookies = await cookieService.extractAll();
            if (cookies.length > 0) {
                // ... (existing aliasing logic)
                await page.setCookie(...finalCookies);
            }
            */
            console.log('[Threads] Operating in Stealth Guest Mode (Session Injection suspended to avoid 404).');


            const url = `https://www.threads.net/@${targetUsername}${sectionType === 'reply' ? '/replies' : ''}`;
            console.log(`[Threads] Patrol start: ${url}`);
            
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Backfill Scrolling Logic
            if (sectionType !== 'story') {
                const scrollCount = sectionType === 'backfill' ? 10 : 2;
                console.log(`[Threads] Scrolling ${scrollCount} times for ${sectionType} exploration...`);
                for (let i = 0; i < scrollCount; i++) {
                    await page.evaluate(() => window.scrollBy(0, 1500));
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // Analyze page state
            const currentUrl = page.url();
            if (currentUrl.includes('login')) {
                console.warn('[Threads] Mission compromised: Encountered login wall. Re-authenticate in Chrome.');
                return [];
            }

            // Evidence Identification
            const candidateSelectors = [
                'div[role="article"]',
                'div[data-pressable-container="true"]',
                'article',
                'div[data-testid="post-container"]'
            ];
            
            let selector = null;
            for (const s of candidateSelectors) {
                try {
                    await page.waitForSelector(s, { timeout: 5000 });
                    selector = s;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!selector) {
                console.log('[Threads] No evidence identified (Selectors exhausted).');
                const timestamp = Date.now();
                const diagPath = path.join(this.evidenceDir, `failure_${targetUsername}_${sectionType}_${timestamp}.png`);
                await page.screenshot({ path: diagPath });
                console.log(`[Threads] Failure screenshot saved: ${diagPath}`);
                return [];
            }

            const elements = await page.$$(selector);
            console.log(`[Threads] Detecting ${elements.length} candidate items via ${selector}`);

            const incidents = [];

            for (const el of elements) {
                const data = await page.evaluate((article) => {
                    const links = Array.from(article.querySelectorAll('a'));
                    
                    // Priority 1: Direct profile link
                    const authorLink = links.find(l => l.href.includes('/@') && !l.href.includes('/post/') && !l.href.includes('/replies'));
                    let author = authorLink ? authorLink.innerText.replace('@', '').trim() : '';
                    
                    // Priority 2: Parse from any link containing /@ (e.g. permalinks)
                    if (!author) {
                        const anyAtLink = links.find(l => l.href.includes('/@'))?.href || '';
                        const match = anyAtLink.match(/\/@([^\/]+)/);
                        if (match) author = match[1];
                    }

                    const spans = Array.from(article.querySelectorAll('span'));
                    
                    // Extract relative time (e.g., 3h, 2d)
                    const timeText = spans.find(s => s.innerText.trim().match(/^[0-9]+[mhdw]$/))?.innerText.trim() || '';
                    
                    const textCandidate = spans
                        .map(s => s.innerText.trim())
                        .filter(txt => txt.length > 0 && txt !== timeText)
                        .sort((a, b) => b.length - a.length)[0] || '';

                    const permalink = links.find(l => l.href.includes('/post/') || l.href.includes('/t/'))?.href || '';
                    
                    // Specific logic for replies: try to find the parent post link
                    let parentLink = '';
                    const contextLink = links.find(l => l.innerText.includes('Replying to') || l.href.includes('/@') && l !== authorLink);
                    if (contextLink && contextLink.href.includes('/post/')) {
                        parentLink = contextLink.href;
                    }

                    return { author, text: textCandidate, link: permalink, parentLink, relativeTime: timeText };
                }, el);

                console.log(`[Threads] Candidate Item -> Author: "${data.author}", Text: "${data.text.substring(0, 30)}...", Link: ${data.link}`);

                if (!data.author && !data.text) {
                    console.log('[Threads] Skipping: Insufficient data.');
                    continue;
                }

                // Strict Normalization & Exact Match Enforcement
                const normalize = (val) => (val || '').trim().replace(/^@/, '').toLowerCase();
                
                const authorNorm = normalize(data.author);
                const targetNorm = normalize(targetUsername);
                const isSubjectAuthor = authorNorm === targetNorm;

                // Mention Detection Logic (Strict exact match for 'wonjeong__1ee')
                const textLower = (data.text || '').toLowerCase();
                const isMention = textLower.includes(targetNorm);

                console.log(`[Threads] Filter Check -> Extracted Author: "${authorNorm}", Target: "${targetNorm}", Match: ${isSubjectAuthor}, Mention: ${isMention}`);
                
                let shouldCapture = false;
                let captureType = 'unknown';

                if (isSubjectAuthor) {
                    if (sectionType === 'reply') {
                        shouldCapture = true;
                        captureType = 'reply';
                    } else if (sectionType === 'post') {
                        shouldCapture = true;
                        captureType = 'post';
                    }
                } else {
                    // Third-party logic
                    if (sectionType === 'reply') {
                        // If it's on the target's reply page but the author is different, it's a third-party comment/reply
                        shouldCapture = true;
                        captureType = 'third-party-reply';
                        console.log(`[THIRD-PARTY COMMENT] detected by @${data.author}`);
                    } else if (isMention) {
                        // Mention detection
                        shouldCapture = true;
                        captureType = 'mention';
                        console.log(`[MENTION DETECTED] by @${data.author}`);
                    }
                }
                
                if (shouldCapture) {
                    console.log(`🚨 [Threads] MATCH IDENTIFIED: ${captureType} by @${data.author}`);
                    console.log(`[CAPTURE TARGET] ${captureType}`);

                    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                    const filename = `${targetUsername}_${captureType}_${ts}.png`;
                    const screenshotPath = path.join(this.evidenceDir, filename);

                    await el.screenshot({ path: screenshotPath }).catch((e) => console.error('[Threads] Screenshot failed:', e.message));
                    console.log(`[Threads] Evidence saved: ${screenshotPath}`);

                    incidents.push({
                        type: captureType,
                        author: data.author,
                        text: data.text,
                        link: data.link || url,
                        parentLink: data.parentLink,
                        screenshotPath,
                        timestamp: this._parseRelativeTime(data.relativeTime),
                        stableId: data.link || `${targetUsername}_${captureType}_${data.text.substring(0, 10)}`
                    });
                } else {
                    console.log(`[Threads] Skipping: Item does not meet capture criteria for subject "${targetUsername}" in ${sectionType} mode.`);
                }
            }


            return incidents;

        } catch (err) {
            console.error('[Threads] Patrol error:', err.message);
            return [];
        } finally {
            await page.close();
        }
    }

    /**
     * Parses Threads relative time (e.g. 3h, 2d) to a Date object.
     */
    _parseRelativeTime(rel) {
        if (!rel) return new Date();
        const now = new Date();
        const match = rel.match(/^([0-9]+)([mhdw])$/);
        if (!match) return now;

        const val = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 'm': return new Date(now.getTime() - val * 60000);
            case 'h': return new Date(now.getTime() - val * 3600000);
            case 'd': return new Date(now.getTime() - val * 86400000);
            case 'w': return new Date(now.getTime() - val * 604800000);
            default: return now;
        }
    }

    /**
     * Captures profile info for the subject to detect changes.
     */
    async patrolProfileMeta(targetUsername) {
        await this.init();
        const page = await this.browser.newPage();
        try {
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.goto(`https://www.threads.net/@${targetUsername}`, { waitUntil: 'networkidle2' });
            
            const meta = await page.evaluate(() => {
                const name = document.querySelector('h1')?.innerText || '';
                const bio = document.querySelector('span[style*="white-space: pre-wrap"]')?.innerText || '';
                return { name, bio };
            });

            // Capture screenshot
            const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const screenshotPath = path.join(this.evidenceDir, `profile_${targetUsername}_${ts}.png`);
            await page.screenshot({ path: screenshotPath }).catch(e => console.error('[Threads] Profile screenshot failed:', e.message));
            
            return { ...meta, screenshotPath };
        } catch (err) {
            console.error('[Threads] Profile meta error:', err.message);
            return null;
        } finally {
            await page.close();
        }
    }
}

module.exports = new ThreadsService();
