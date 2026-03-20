const openaiService = require('./services/openai');
require('dotenv').config();

async function test() {
    console.log('🧪 [Test: Persona] Verifying "Officer Gyeongsu" response style...');
    
    const context = {
        targets: process.env.THREADS_MALICIOUS_ACCOUNTS,
        interval: process.env.POLL_INTERVAL_MINUTES
    };

    const queries = [
        "감시 대상이 누구지?",
        "지금 수사 상황 보고해바",
        "안녕 반가워"
    ];

    for (const q of queries) {
        console.log(`\n💬 User Query: "${q}"`);
        const response = await openaiService.generateResponse(q, context);
        console.log(`📡 Officer Response:\n------------------\n${response}\n------------------`);
    }
}

test();
