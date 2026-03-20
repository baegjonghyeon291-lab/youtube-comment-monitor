require('dotenv').config();
const path = require('path');
const threadsService = require('./services/threads');
const youtubeService = require('./services/youtube');
const storage = require('./services/storage');
const telegram = require('./services/telegram');

/**
 * gyeongsu-cyber-guardian logic: Mission Control.
 */
async function missionControl() {
    console.log('\n🛡️  [Mission Control: Cyber Guardian] Active.');
    console.log('────────────────────────────────────────────');
    
    // Initialize AI Assistant Polling
    telegram.initPolling();

    // 🕵️ Status Report
    const startupReport = `[IMAGE: https://raw.githubusercontent.com/wonseokjung/solopreneur-ai-agents/main/agents/gyeongsu/assets/gyeongsu_hello.png]\n대표님, 사이버수사대 경수 요원 현장 복귀 보고드립니다. 부재중 발생한 활동을 소급 조회(Backfill)한 후 실시간 감시 체제로 전환하겠습니다.`;
    await telegram._sendGyeongsuReport(process.env.TELEGRAM_CHAT_ID, startupReport);

    const maliciousAccounts = (process.env.THREADS_MALICIOUS_ACCOUNTS || '').split(',').map(acc => acc.trim());
    const primaryTarget = maliciousAccounts[0];

    if (!primaryTarget) {
        console.error('[Mission] Error: No malicious account identified. Check .env');
        process.exit(1);
    }

    // ── OFFLINE GAP RECOVERY ────────────────────────────────────────
    // 마지막 성공 감시 시각을 읽어 gap 계산
    const lastCheckpoint = storage.getCheckpoint();
    const now = new Date();

    let recoveryFrom = null; // gap 시작 시각
    let gapMinutes = 0;

    if (lastCheckpoint) {
        recoveryFrom = new Date(lastCheckpoint);
        gapMinutes = Math.round((now - recoveryFrom) / 60000);
        console.log(`\n[RECOVERY] last scan time: ${recoveryFrom.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
        console.log(`[RECOVERY] gap detected: ${gapMinutes}분 (${Math.round(gapMinutes/60 * 10) / 10}시간)`);
    } else {
        // checkpoint 없으면 최대 3일 소급
        recoveryFrom = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        gapMinutes = 3 * 24 * 60;
        console.log(`[RECOVERY] no checkpoint found. Defaulting to 3-day lookback.`);
    }
    // ──────────────────────────────────────────────────────────────────

    /**
     * Patrol logic shared between recovery and real-time
     * @param {boolean} isBackfill - true: gap recovery 모드
     * @param {Date} gapStart - recovery 시 gap 시작 시각
     */
    const performPatrol = async (isBackfill = false, gapStart = null) => {
        const modeLabel = isBackfill ? 'RECOVERY' : 'REAL-TIME';
        console.log(`\n[${new Date().toLocaleTimeString()}] 🔍 [${modeLabel}] Scanning @${primaryTarget}...`);
        
        // gap recovery 필터 기준
        const cutoffTime = gapStart
            ? gapStart
            : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // fallback: 3일

        try {
            const results = [];
            
            // 1. Profile Meta Check (Name/Bio)
            console.log(`[${modeLabel}] Checking profile metadata...`);
            const currentMeta = await threadsService.patrolProfileMeta(primaryTarget);
            if (currentMeta) {
                const lastMeta = storage.getProfileMeta(primaryTarget);
                if (lastMeta && (lastMeta.name !== currentMeta.name || lastMeta.bio !== currentMeta.bio)) {
                    console.log(`🚨 [DANGER] Profile change detected for @${primaryTarget}`);
                    
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                    const screenshotPath = path.join(process.cwd(), 'evidence', `profile_change_${primaryTarget}_${ts}.png`);
                    
                    results.push({
                        type: 'profile-change',
                        author: primaryTarget,
                        text: `[정보 변경 감지]\n\n(이전)\n이름: ${lastMeta.name}\n소개: ${lastMeta.bio}\n\n(현재)\n이름: ${currentMeta.name}\n소개: ${currentMeta.bio}`,
                        link: `https://www.threads.net/@${primaryTarget}`,
                        screenshotPath: currentMeta.screenshotPath,
                        stableId: `profile_change_${Date.now()}`
                    });
                }
                storage.setProfileMeta(primaryTarget, currentMeta);
            }

            // 2. Scan Posts & Replies
            const scanType = isBackfill ? 'backfill' : 'post';
            
            console.log(`[${modeLabel}] Scanning Threads activities...`);
            const posts = await threadsService.patrolProfile(primaryTarget, scanType);
            results.push(...posts);

            const replies = await threadsService.patrolProfile(primaryTarget, 'reply');
            results.push(...replies);

            // 3. YouTube
            const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID;
            if (youtubeChannelId) {
                const targetCreators = (process.env.TARGET_AUTHOR_NAMES || '').split(',').map(n => n.trim()).filter(n => n);
                const videoUrls = await youtubeService.patrolChannel(youtubeChannelId);
                for (const videoUrl of videoUrls) {
                    const ytIncidents = await youtubeService.patrolVideo(videoUrl, targetCreators);
                    results.push(...ytIncidents);
                }
            }

            // Processing results
            console.log(`[${modeLabel}] Scan complete. Filtering ${results.length} candidate items...`);

            if (isBackfill) {
                console.log(`[RECOVERY] scanning missed activities... (gap start: ${cutoffTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`);
            }

            let recoveredCount = 0;

            for (const incident of results) {
                const dedupeKey = `${incident.author}_${incident.type}_${incident.stableId}`;
                
                // ★ 기존 dedupe 그대로 활용 (이미 보낸 항목은 스킵)
                if (storage.isProcessed(dedupeKey)) continue;

                // ★ RECOVERY 모드: gap 시작 시각 이후 활동만 포함
                if (isBackfill && incident.timestamp) {
                    if (incident.timestamp.getTime() < cutoffTime.getTime()) {
                        console.log(`[RECOVERY] Skipping: before gap start (${incident.timestamp.toLocaleString()})`);
                        continue;
                    }
                }

                console.log(`🚨 [MATCH] ${incident.type} by @${incident.author}`);

                if (isBackfill) {
                    console.log(`[RECOVERY] sending recovered alert: ${incident.type} / stableId: ${incident.stableId}`);
                    recoveredCount++;
                }

                try {
                    await telegram.sendIncidentReport(incident, isBackfill);
                    storage.markAsProcessed(dedupeKey);
                } catch (err) {
                    console.error(`❌ Reported failed for @${incident.author}:`, err.message);
                }
            }

            if (isBackfill) {
                console.log(`[RECOVERY] recovered incident count: ${recoveredCount}`);
            }

            // ★ 성공 시 checkpoint 업데이트 (gap recovery 기준점 갱신)
            storage.setCheckpoint(new Date().toISOString());

        } catch (err) {
            console.error(`[${modeLabel}] Operational error:`, err.message);
        }
    };

    // 🚀 Phase 1: OFFLINE GAP RECOVERY (마지막 감시 이후 놓친 활동 복구)
    console.log(`\n🕵️ Phase 1: [RECOVERY] Initiating Gap Recovery Patrol...`);
    console.log(`[RECOVERY] scanning missed activities...`);
    await performPatrol(true, recoveryFrom);
    console.log('[RECOVERY] completed ✅');

    // 🚀 Phase 2: Continuity (Real-time)
    const intervalMin = parseInt(process.env.POLL_INTERVAL_MINUTES) || 120;
    console.log(`\n🕵️ Phase 2: Transitioning to Real-time Monitoring (${intervalMin} min interval).`);
    
    setInterval(() => performPatrol(false), intervalMin * 60000);
}

process.on('uncaughtException', (err) => {
    console.error('💥 [CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [CRITICAL] Unhandled Promise Rejection:', reason);
});

missionControl().catch((err) => {
    console.error('💥 [CRITICAL] missionControl crashed:', err);
});
