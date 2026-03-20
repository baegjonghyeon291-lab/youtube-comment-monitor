const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

async function diagnose() {
    console.log('🧪 [Diagnosis] Testing Real Profile Reuse...');
    
    const targetUrl = 'https://www.threads.net/@threads';
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const realChromeProfile = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
    
    // Create a lean temp profile by linking/copying only essential session files if possible
    // But for simplicity in diagnosis, we'll try to use the profile directly if Chrome is closed,
    // or point to a TEMP directory and see if it works as a guest.
    // AND then we'll try the "Minimal Fix" (Stealth + No Cookies).
    
    const runTest = async (name, options) => {
        console.log(`\n▶️ Testing: ${name}...`);
        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                ...(options.profile ? [`--user-data-dir=${options.profile}`, '--profile-directory=Default'] : [])
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        try {
            console.log(`[${name}] Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { waitUntil: 'networkidle1', timeout: 30000 });
            
            const finalUrl = page.url();
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
            const is404 = bodyText.includes('길을 잃었습니다') || bodyText.includes('Page not found');
            console.log(`[${name}] URL: ${finalUrl}`);
            console.log(`[${name}] 404: ${is404}`);

            const screenshotName = `diag_profile_${name.toLowerCase().replace(/\s+/g, '_')}.png`;
            await page.screenshot({ path: screenshotName });
            
        } catch (err) {
            console.error(`[${name}] Error: ${err.message}`);
        } finally {
            await browser.close();
        }
    };

    // Test 1: Stealth + No Cookies (The Working Baseline)
    await runTest('Stealth No Cookies', { profile: null });

    console.log('\n✅ [Diagnosis] Completed.');
}

diagnose();
