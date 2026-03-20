const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const cookieService = require('./services/cookies');

async function diagnose() {
    console.log('🧪 [Diagnosis] Starting targeted session test (WITH Cookies + Stealth)...');
    
    // Test parameters
    const targetUrl = 'https://www.threads.net/@threads';
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    // Launch browser
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 1000 });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

    // Inject Cookies (Aliased)
    const cookies = await cookieService.extractAll();
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
            if (!seen.has(key)) { finalCookies.push(ck); seen.add(key); }
        });
        
        await page.setCookie(...finalCookies);
        console.log(`[Diagnosis] Injected ${finalCookies.length} security tokens.`);
    }

    try {
        console.log(`[Target] Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log(`[Target] Final URL: ${page.url()}`);
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        const is404 = bodyText.includes('길을 잃었습니다') || bodyText.includes('Page not found');
        console.log(`[Target] 404 Page detected: ${is404}`);

        const screenshotName = `diag_target_with_cookies.png`;
        await page.screenshot({ path: screenshotName });
        console.log(`[Target] Screenshot saved: ${screenshotName}`);

    } catch (err) {
        console.error(`[Target] Error: ${err.message}`);
    } finally {
        await browser.close();
    }
}

diagnose();
