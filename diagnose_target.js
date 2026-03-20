const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function diagnose() {
    console.log('🧪 [Diagnosis] Starting targeted session test (No Cookies)...');
    
    // Test parameters
    const targetUrl = 'https://www.threads.net/@wonjeong__1ee';
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    const tempProfilePath = path.join(os.tmpdir(), `threads_target_${Date.now()}`);
    if (!fs.existsSync(tempProfilePath)) fs.mkdirSync(tempProfilePath);

    const runTest = async (name, options) => {
        console.log(`\n▶️ Testing: ${name}...`);
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

        try {
            console.log(`[${name}] Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            
            console.log(`[${name}] Final URL: ${page.url()}`);
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
            const is404 = bodyText.includes('길을 잃었습니다') || bodyText.includes('Page not found');
            console.log(`[${name}] 404 Page detected: ${is404}`);

            const screenshotName = `diag_target_nocookies.png`;
            await page.screenshot({ path: screenshotName });
            console.log(`[${name}] Screenshot saved: ${screenshotName}`);

        } catch (err) {
            console.error(`[${name}] Error: ${err.message}`);
        } finally {
            await browser.close();
        }
    };

    await runTest('Target No Cookies', {});
    console.log('\n✅ [Diagnosis] Targeted test completed.');
}

diagnose();
