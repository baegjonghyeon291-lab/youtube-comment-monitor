const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cookieService = require('./services/cookies');

async function test() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 1600 });

    const cookies = await cookieService.extractAll();
    console.log(`[Test] Total raw cookies extracted: ${cookies.length}`);
    const counts = {};
    cookies.forEach(c => counts[c.domain] = (counts[c.domain] || 0) + 1);
    console.log('[Test] Domains found:', JSON.stringify(counts, null, 2));

    if (cookies.length > 0) {
        const aliased = [];
        const domains = ['threads.net', 'threads.com'];
        cookies.forEach(c => {
            aliased.push(c);
            const isIG = c.domain.includes('instagram.com');
            const isThreadNet = c.domain.includes('threads.net');
            const isThreadCom = c.domain.includes('threads.com');
            if (isIG) {
                domains.forEach(d => aliased.push({ ...c, domain: c.domain.replace('instagram.com', d) }));
            } else if (isThreadNet) {
                aliased.push({ ...c, domain: c.domain.replace('threads.net', 'threads.com') });
            } else if (isThreadCom) {
                aliased.push({ ...c, domain: c.domain.replace('threads.com', 'threads.net') });
            }
        });
        const finalCookies = [];
        const seen = new Set();
        aliased.forEach(ck => {
            const key = `${ck.domain}:${ck.name}`;
            if (!seen.has(key)) {
                finalCookies.push(ck);
                seen.add(key);
            }
        });
        await page.setCookie(...finalCookies);
    }

    try {
        const testUrl = 'https://www.threads.net/@threads'; // Use a guaranteed public account
        console.log(`[Test] Navigating to ${testUrl}...`);
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        console.log('[Test] Final URL:', page.url());
        
        const screenshotPath = 'diag_test_public.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[Test] Screenshot saved to ${screenshotPath}`);

        const candidateSelectors = [
            'div[role="article"]',
            'div[data-pressable-container="true"]',
            'article',
            'div[data-testid="post-container"]'
        ];

        
        let foundSelector = null;
        for (const s of candidateSelectors) {
            const exists = await page.evaluate((sel) => !!document.querySelector(sel), s);
            if (exists) {
                foundSelector = s;
                break;
            }
        }
        
        console.log('[Test] Found Selector:', foundSelector || 'None');

        if (foundSelector) {
            const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, foundSelector);
            console.log(`[Test] Detected ${count} items via ${foundSelector}`);
        }


    } catch (err) {

        console.error('[Test] Error:', err.message);
    } finally {
        await browser.close();
    }
}

test();
