const telegram = require('./services/telegram');
require('dotenv').config();

async function test() {
    console.log('🧪 [Test: Telegram] Starting forced delivery test...');
    console.log(`[Test: Telegram] Token: ${process.env.TELEGRAM_BOT_TOKEN ? 'Loaded (starts with ' + process.env.TELEGRAM_BOT_TOKEN.substring(0, 5) + ')' : 'MISSING'}`);
    console.log(`[Test: Telegram] Chat ID: ${process.env.TELEGRAM_CHAT_ID ? 'Loaded (' + process.env.TELEGRAM_CHAT_ID + ')' : 'MISSING'}`);

    const testIncident = {
        type: 'post',
        author: '시스템_자가진단',
        text: '이 메시지는 한국어 알림 및 AI 비서 업그레이드를 확인하기 위한 강제 테스트 알림입니다.',
        link: 'https://www.threads.net/',
        screenshotPath: null
    };


    console.log('[Test: Telegram] Calling telegram.sendIncidentReport()...');
    try {
        await telegram.sendIncidentReport(testIncident);
        console.log('✅ [Test: Telegram] Function execution completed without crash.');
        console.log('📍 Result: Check your Telegram chat. If no message arrived, wait for API logs.');
    } catch (err) {
        console.error('❌ [Test: Telegram] Fatal error during test:', err);
    }
}

test();
