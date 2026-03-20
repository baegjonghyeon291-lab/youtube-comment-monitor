const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

/**
 * gyeongsu-cyber-guardian logic: Robust browser session retrieval.
 * Unified cookie extraction from all Chrome profiles (sqlite3 Async version).
 */
class CookieService {
    constructor() {
        this.targetDomains = [
            'threads.net', '.threads.net', 'www.threads.net',
            'threads.com', '.threads.com', 'www.threads.com',
            'instagram.com', '.instagram.com', 'www.instagram.com'
        ];
        this.chromeBasePath = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    }

    getProfilePaths() {
        const paths = [path.join(this.chromeBasePath, 'Default')];
        if (fs.existsSync(this.chromeBasePath)) {
            try {
                fs.readdirSync(this.chromeBasePath).forEach(file => {
                    if (file.startsWith('Profile ')) paths.push(path.join(this.chromeBasePath, file));
                });
            } catch (err) {
                console.error('[Cookies] Profile scan failed:', err.message);
            }
        }
        const finalPaths = [];
        paths.forEach(p => {
            finalPaths.push(path.join(p, 'Network', 'Cookies'));
            finalPaths.push(path.join(p, 'Cookies'));
        });
        return finalPaths;
    }

    getChromePassword() {
        try {
            return execSync('security find-generic-password -w -s "Chrome Safe Storage"', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
        } catch (e) {
            return null;
        }
    }

    decryptValue(encryptedValue, key) {
        if (!encryptedValue || encryptedValue.length === 0) return { value: '', ok: true };
        const buf = Buffer.isBuffer(encryptedValue) ? encryptedValue : Buffer.from(encryptedValue);
        const prefix = buf.slice(0, 3).toString('ascii');
        if (prefix !== 'v10' && prefix !== 'v11') return { value: buf.toString('utf8'), ok: true };
        if (!key) return { value: '', ok: false };

        try {
            const iv = Buffer.alloc(16, ' ');
            const encData = buf.slice(3);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            decipher.setAutoPadding(true);
            const decrypted = Buffer.concat([decipher.update(encData), decipher.final()]);
            if (decrypted.length <= 32) return { value: '', ok: false };
            const realData = decrypted.slice(32);
            let lastValid = realData.length;
            for (let i = 0; i < realData.length; i++) {
                if (realData[i] < 0x20 || realData[i] > 0x7e) { lastValid = i; break; }
            }
            return { value: realData.slice(0, lastValid).toString('utf8').trim(), ok: true };
        } catch (e) {
            return { value: '', ok: false };
        }
    }

    async extractAll() {
        console.log('[Cookies] Initiating multi-profile evidence (credentials) scan...');
        const profilePaths = this.getProfilePaths();
        const password = this.getChromePassword();
        const aesKey = password ? crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1') : null;

        const allCookies = [];
        const seen = new Set();

        for (const dbPath of profilePaths) {
            if (!fs.existsSync(dbPath)) continue;
            
            const tempDb = path.join(os.tmpdir(), `guard_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
            try {
                fs.copyFileSync(dbPath, tempDb);
                
                const cookiesFromDb = await new Promise((resolve) => {
                    const db = new sqlite3.Database(tempDb, sqlite3.OPEN_READONLY, (err) => {
                        if (err) return resolve([]);
                        
                        db.all("SELECT name AS name FROM sqlite_master WHERE type='table' AND (name='cookies' OR name='Cookies')", (err, tables) => {
                            if (err || !tables || tables.length === 0) {
                                db.close();
                                return resolve([]);
                            }
                            
                            const tableName = tables[0].name;
                            const placeholders = this.targetDomains.map(() => '?').join(', ');
                            const query = `SELECT name, encrypted_value, host_key, path, expires_utc, is_httponly, is_secure, samesite FROM ${tableName} WHERE host_key IN (${placeholders})`;
                            
                            db.all(query, this.targetDomains, (err, rows) => {
                                db.close();
                                if (err || !rows) return resolve([]);
                                resolve(rows);
                            });
                        });
                    });
                });

                cookiesFromDb.forEach(row => {
                    const dec = this.decryptValue(row.encrypted_value, aesKey);
                    if (dec.ok) {
                        const cookie = {
                            name: row.name,
                            value: dec.value,
                            domain: row.host_key,
                            path: row.path || '/',
                            httpOnly: Boolean(row.is_httponly),
                            secure: Boolean(row.is_secure),
                            sameSite: row.samesite === 0 ? 'Strict' : (row.samesite === 1 ? 'Lax' : 'None')
                        };
                        const key = `${cookie.domain}:${cookie.name}`;
                        if (!seen.has(key)) {
                            allCookies.push(cookie);
                            seen.add(key);
                        }
                    }
                });
                
                fs.unlinkSync(tempDb);
            } catch (e) {
                if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
            }
        }
        
        console.log(`[Cookies] Scan complete. Found ${allCookies.length} unique security tokens.`);
        return allCookies;
    }
}

module.exports = new CookieService();
