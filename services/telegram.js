const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
require('dotenv').config();
const openaiService = require('./openai');

/**
 * gyeongsu-cyber-guardian logic: Investigative alert system & AI Assistant.
 */
class TelegramService {
    constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        this.chatId = chatId;
        this.isPolling = false;

        if (!token || !chatId) {
            console.warn('[Telegram] Warning: Credentials missing. Alert system deactivated.');
            this.bot = null;
        } else {
            // Disable auto-polling to prevent multiple instance conflicts
            this.bot = new TelegramBot(token, { polling: false });
            console.log('[Telegram] Intelligence Center Initialized (Static Mode).');
        }
    }

    /**
     * Initializes the polling loop for the AI Assistant.
     */
    initPolling() {
        if (!this.bot) return;
        if (this.isPolling) {
            console.log('[Telegram] Warning: Polling is already active.');
            return;
        }

        console.log('[Telegram] Activating Intelligence Center Polling Loop...');
        this.bot.startPolling();
        this.isPolling = true;

        this.bot.on('message', async (msg) => {
            if (!msg.text) return;
            
            const senderChatId = msg.chat.id;
            const userText = msg.text;

            const intervalMin = parseInt(process.env.POLL_INTERVAL_MINUTES) || 120;
            const intervalDisplay = intervalMin >= 60 ? `${intervalMin / 60}시간` : `${intervalMin}분`;

            const context = {
                targets: process.env.THREADS_MALICIOUS_ACCOUNTS,
                interval: intervalDisplay
            };

            if (userText === '/start') {
                const startMsg = `[IMAGE: https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_hello.png]\n대표님, 사이버수사대 경수 요원입니다. 현재 Threads 전담 순찰 체계를 가동 중입니다. 무엇이든 물어봐 주십시오. 즉시 보고드리겠습니다.`;
                await this._sendGyeongsuReport(senderChatId, startMsg);
                return;
            }

            console.log(`[Telegram] User Request: "${userText}"`);
            const aiResponse = await openaiService.generateResponse(userText, context);
            await this._sendGyeongsuReport(senderChatId, aiResponse);
        });

        console.log('✅ [Telegram] Intelligence Center Polling Active.');
    }

    /**
     * Internal helper to send the unified Gyeongsu report (Photo then Text).
     */
    async _sendGyeongsuReport(chatId, rawContent) {
        try {
            let imageUrl = 'https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_thinking.png';
            let reportText = rawContent;

            // Extract custom image tag if present
            const imageMatch = rawContent.match(/\[IMAGE:\s*(.*?)\]/);
            if (imageMatch) {
                imageUrl = imageMatch[1].trim();
                reportText = rawContent.replace(imageMatch[0], '').trim();
            }

            // 1. Send Gyeongsu Persona Image first
            await this.bot.sendPhoto(chatId, imageUrl);

            // 2. Send the Report Text
            await this.bot.sendMessage(chatId, reportText);
            
        } catch (err) {
            console.error('[Telegram] Gyeongsu Report Delivery Failed:', err.message);
        }
    }

    /**
     * Sends an incident report with metadata and screenshot evidence.
     */
    async sendIncidentReport(incident, isBackfill = false) {
        if (!this.bot) return;

        const { type, author, text, link, screenshotPath } = incident;
        const prefix = isBackfill ? '📂 [복구 감지]' : '🚨 [실시간 감지]';
        const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

        // Gyeongsu Report Template (Second Screenshot Style)
        let reportText = `
${prefix}
대표님, '${author}' 계정에 대한 수사 중 활동이 포착되었습니다.

[수사 보고서]
────────────────────
🕵️ 대상: @${author}
📂 유형: ${this.getCategoryLabel(type)}
📅 시각: ${timestamp}
🔗 활동 링크: ${link}
`.trim();

        if (incident.parentLink) {
            reportText += `\n🔗 원문(부모) 링크: ${incident.parentLink}`;
        }

        reportText += `\n────────────────────\n\n[채득 증거 요약]\n${text || '(감지된 텍스트가 없습니다)'}\n\n해당 활동에 대해 법적 증거를 철저히 채득하여 박제 완료했습니다. 즉시 확인을 권고드립니다.`;

        try {
            // Unify with Gyeongsu Persona formatting
            // Send Gyeongsu "Warning" image first for incidents
            await this.bot.sendPhoto(this.chatId, 'https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_warning.png');
            
            // Send report text
            await this.bot.sendMessage(this.chatId, reportText);

            // Send actual evidence screenshot
            if (screenshotPath && fs.existsSync(screenshotPath)) {
                await this.bot.sendPhoto(this.chatId, fs.createReadStream(screenshotPath), { caption: `📸 [사이버 가디언] 현장 채득 증거 사진 (@${author})` });
            }

            console.log(`✅ [Telegram] Success: Investigative report transmitted for @${author}`);
        } catch (err) {
            console.error(`❌ [Telegram] Failed report transmission. Error:`, err.message);
        }
    }



    getCategoryLabel(type) {
        const labels = {
            'post': '새 포스트 (Original Post)',
            'reply': '답글/댓글 (Reply/Comment)',
            'third-party-reply': '제3자 댓글 (Third-party Comment)',
            'mention': '계정 언급 (Account Mention)',
            'mention_reply': '답글 내 언급 (Mention in Reply)',
            'mention_post': '포스트 내 언급 (Mention in Post)',
            'youtube-comment': '유튜브 댓글 (YouTube Comment)',
            'profile-change': '프로필 정보 변경 (Profile Meta Change)'
        };
        return labels[type] || '기타 활동 (Unknown Activity)';
    }
}


module.exports = new TelegramService();
