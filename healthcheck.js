const fs = require('fs');
const path = require('path');

/**
 * Health check script for WhatsApp Bot
 * Checks if the bot is running and responsive
 */

async function healthCheck() {
    try {
        // Check if session file exists (indicates WhatsApp is connected)
        const sessionPath = path.join(__dirname, '.wwebjs_auth');
        const sessionExists = fs.existsSync(sessionPath);
        
        if (!sessionExists) {
            console.log('❌ WhatsApp session not found');
            process.exit(1);
        }
        
        // Check if process is responsive
        const lastActivity = getLastActivity();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (now - lastActivity > fiveMinutes) {
            console.log('❌ Bot appears to be unresponsive');
            process.exit(1);
        }
        
        // Check memory usage
        const memoryUsage = process.memoryUsage();
        const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
        
        if (memoryMB > 400) { // 400MB threshold
            console.log(`⚠️  High memory usage: ${memoryMB.toFixed(2)}MB`);
        }
        
        console.log('✅ Health check passed');
        console.log(`📊 Memory usage: ${memoryMB.toFixed(2)}MB`);
        console.log(`🔌 Session exists: ${sessionExists}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        process.exit(1);
    }
}

function getLastActivity() {
    try {
        const activityFile = path.join(__dirname, 'last_activity.txt');
        if (fs.existsSync(activityFile)) {
            const timestamp = fs.readFileSync(activityFile, 'utf8');
            return parseInt(timestamp);
        }
    } catch (error) {
        console.warn('Could not read last activity file');
    }
    
    // If no activity file, assume current time
    return Date.now();
}

// Run health check
healthCheck();