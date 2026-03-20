const OpenAI = require('openai');
require('dotenv').config();

class OpenAIService {
    constructor() {
        // Lazy init: OPENAI_API_KEY가 없어도 모듈 로딩 시 crash하지 않음
        this.openai = null;
    }

    _getClient() {
        if (!this.openai) {
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY environment variable is not set.');
            }
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
        return this.openai;
    }

    /**
     * Generates a Korean response in the "Officer Gyeongsu" persona.
     * @param {string} userMessage The incoming message from Telegram.
     * @param {object} context Monitoring context (targets, interval, etc.)
     */
    async generateResponse(userMessage, context = {}) {
        try {
            console.log('[OpenAI] Loading Gyeongsu SKILL for persona...');
            const fs = require('fs');
            const path = require('path');
            const skillPath = path.join(__dirname, '../.agent/skills/gyeongsu/SKILL.md');
            const skillContent = fs.readFileSync(skillPath, 'utf8');

            const contextString = `
[현장 감시 시스템 데이터]
- 감시 대상: ${context.targets || '알 수 없음'}
- 순찰 간격: ${context.interval || '1'}분
- 감시 플랫폼: Threads / Instagram / YouTube
- 수사 목표: 악성 사용자의 신규 게시물 및 답글 실시간 추적 및 증거 확보
`.trim();

            const response = await this._getClient().chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: `
당신은 다음 SKILL 가이드를 완벽하게 준수하는 페르소나를 수행해야 합니다.

${skillContent}

---

[추가 보안 수사 문맥]
위의 SKILL 지침을 따르되, 현재 당신은 아래의 실시간 모니터링 환경에서 '사이버수사대 경수 요원'으로 활동 중입니다. 
대표님께 보고할 때 이 데이터를 적극 활용하십시오.

${contextString}

---

[출력 형식 강제 규칙]
모든 응답은 반드시 다음 형식을 지켜야 합니다:
1. 첫 번째 줄에는 상황에 가장 적합한 경수 요원의 이미지 URL을 '[IMAGE: url]' 형식으로 표기합니다.
   (예: [IMAGE: https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_thinking.png])
2. 두 번째 줄부터는 수사 보고서 본문을 작성합니다. 
3. 답변은 불필요한 인사 없이 "대표님, ..."으로 시작하는 직접적인 수사 보고 스타일이어야 합니다.
`.trim()
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                temperature: 0.8,
                max_tokens: 1500
            });

            let content = response.choices[0].message.content.trim();
            
            // Safety fallback: If AI forgot the IMAGE tag, add a default thinking image
            if (!content.startsWith('[IMAGE:')) {
                content = `[IMAGE: https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_thinking.png]\n${content}`;
            }

            return content;

        } catch (err) {
            console.error('[OpenAI] Error generating response:', err.message);
            return '대표님, 수사망 통신 모듈에 일시적인 장애가 발생했습니다. 즉시 복원하여 보고 올리겠습니다!';
        }
    }
}





module.exports = new OpenAIService();
