const fs = require('fs');
const path = require('path');

/**
 * gyeongsu-cyber-guardian logic: Simple session storage for de-duplication.
 */
class IncidentLog {
    constructor(filePath = 'incident_logs.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.processedIds = new Set();
        this.checkpoint = null;
        this.profileMeta = {}; // { '@username': { name, bio } }
        this.load();
    }

    save() {
        try {
            const data = {
                checkpoint: this.checkpoint || null,
                profileMeta: this.profileMeta || {},
                processedIds: Array.from(this.processedIds)
            };
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('[Storage] Error saving incident logs:', err.message);
        }
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            try {
                const rawData = fs.readFileSync(this.filePath, 'utf8');
                const data = JSON.parse(rawData);
                
                // Compatibility check: handle old format [id1, id2] or new format {checkpoint, processedIds}
                if (Array.isArray(data)) {
                    this.processedIds = new Set(data);
                    this.checkpoint = null;
                    this.profileMeta = {};
                } else {
                    this.processedIds = new Set(data.processedIds || []);
                    this.checkpoint = data.checkpoint || null;
                    this.profileMeta = data.profileMeta || {};
                }
                
                console.log(`[Storage] Incident logs loaded. Total entries: ${this.processedIds.size}, Checkpoint: ${this.checkpoint}`);
            } catch (err) {
                console.error('[Storage] Error reading incident logs:', err.message);
                this.processedIds = new Set();
                this.checkpoint = null;
            }
        }
    }

    isProcessed(id) {
        return this.processedIds.has(id);
    }

    markAsProcessed(id) {
        if (!this.processedIds.has(id)) {
            this.processedIds.add(id);
            this.save();
            return true;
        }
        return false;
    }

    getCheckpoint() {
        return this.checkpoint;
    }

    setCheckpoint(timestamp) {
        this.checkpoint = timestamp;
        this.save();
    }

    getProfileMeta(username) {
        return this.profileMeta[username] || null;
    }

    setProfileMeta(username, meta) {
        this.profileMeta[username] = meta;
        this.save();
    }
}

module.exports = new IncidentLog();
