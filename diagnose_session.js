const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function diagnose() {
    console.log('🧪 [Diagnosis] Starting session/environment test...');
    
    // Test parameters
    const testUrl = 'https://www.threads.net/@threads';
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    // Setup a clean Temp Profile to avoid lock issues with real Chrome
    const tempProfilePath = path.join(os.tmpdir(), `threads_diag_${Date.now()}`);
    if (!fs.existsSync(tempProfilePath)) fs.mkdirSync(tempProfilePath);

    console.log(`[Diagnosis] Using Chrome Executable: ${chromePath}`);
    console.log(`[Diagnosis] Using Temp Profile: ${tempProfilePath}`);

    const runTest = async (name, options) => {
        console.log(`\n▶️ Testing: ${name}...`);
        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: options.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                ...(options.args || [])
            ],
            userDataDir: options.useProfile ? tempProfilePath : undefined
        });

        const page = await browser.newPage();
        
        // Stealth settings
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 1000 });
        
        // Inject script to bypass basic automation detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            console.log(`[${name}] Navigating to ${testUrl}...`);
            await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const finalUrl = page.url();
            console.log(`[${name}] Final URL: ${finalUrl}`);
            
            const content = await page.evaluate(() => {
                const h1 = document.querySelector('h1')?.innerText;
                const hasArticle = !!document.querySelector('div[role="article"], article');
                const is404 = document.body.innerText.includes('길을 잃었습니다') || document.body.innerText.includes('Page not found');
                return { h1, hasArticle, is404 };
            });

            console.log(`[${name}] Title/H1: ${content.h1 || 'N/A'}`);
            console.log(`[${name}] Article detected: ${content.hasArticle}`);
            console.log(`[${name}] 404 Page detected: ${content.is404}`);

            const screenshotName = `diag_${name.replace(/\s+/g, '_').toLowerCase()}.png`;
            await page.screenshot({ path: screenshotName });
            console.log(`[${name}] Screenshot saved: ${screenshotName}`);

        } catch (err) {
            console.error(`[${name}] Error: ${err.message}`);
        } finally {
            await browser.close();
        }
    };

    // Experiment 1: Headless (New) + Stealth attempt
    await runTest('Headless New Stealth', { headless: 'new' });

    // Experiment 2: Headful (Visible) - Often bypasses simple bot checks
    await runTest('Headful', { headless: false });

    console.log('\n✅ [Diagnosis] Tests completed.');
}

diagnose();
