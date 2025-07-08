const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const cron = require('node-cron');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class WhatsAppAttendanceBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });
        
        this.doc = null;
        this.usersSheet = null;
        this.reportsSheet = null;
        this.currentAdmin = null;
        this.userSessions = new Map();
        
        this.initializeBot();
        this.setupCronJobs();
    }

    async initializeBot() {
        try {
            // Initialize Google Sheets
            await this.initializeGoogleSheets();
            
            // Setup WhatsApp client event handlers
            this.setupWhatsAppEvents();
            
            // Initialize the client
            this.client.initialize();
            
            console.log('🚀 WhatsApp Attendance Bot initialized successfully!');
        } catch (error) {
            console.error('❌ Failed to initialize bot:', error);
            await this.notifyAdmin('🚨 Bot initialization failed: ' + error.message);
        }
    }

    async initializeGoogleSheets() {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await this.doc.loadInfo();
        
        // Get or create sheets
        this.usersSheet = this.doc.sheetsByTitle['Users'] || await this.doc.addSheet({ title: 'Users' });
        this.reportsSheet = this.doc.sheetsByTitle['Reports'] || await this.doc.addSheet({ title: 'Reports' });
        
        // Initialize headers if needed
        await this.initializeSheetHeaders();
        
        console.log('📊 Google Sheets initialized successfully');
    }

    async initializeSheetHeaders() {
        // Users sheet headers
        try {
            await this.usersSheet.loadHeaderRow();
        } catch (error) {
            await this.usersSheet.setHeaderRow([
                'firstName', 'lastName', 'personalCode', 'phoneNumber', 
                'permission', 'createdAt', 'updatedAt'
            ]);
        }

        // Reports sheet headers
        try {
            await this.reportsSheet.loadHeaderRow();
        } catch (error) {
            await this.reportsSheet.setHeaderRow([
                'phoneNumber', 'reportType', 'status', 'location', 
                'reportDate', 'reportTime', 'notes', 'updatedBy'
            ]);
        }
    }

    setupWhatsAppEvents() {
        this.client.on('qr', (qr) => {
            console.log('📱 QR Code generated. Scan it with WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', async () => {
            console.log('✅ WhatsApp client is ready!');
            await this.notifyAdmin('✅ Bot is now online and ready!');
        });

        this.client.on('disconnected', async (reason) => {
            console.log('❌ WhatsApp client disconnected:', reason);
            await this.notifyAdmin('❌ Bot disconnected: ' + reason);
        });

        this.client.on('message', async (message) => {
            if (message.from.includes('@g.us') || message.isStatus) return;
            
            try {
                await this.handleMessage(message);
            } catch (error) {
                console.error('Error handling message:', error);
                await message.reply('❌ אירעה שגיאה. נסה שוב מאוחר יותר.');
            }
        });
    }

    async handleMessage(message) {
        const phoneNumber = message.from.replace('@c.us', '');
        const text = message.body.trim();
        
        // Check if user is registered
        const user = await this.getUserByPhone(phoneNumber);
        
        if (!user) {
            await this.handleUnregisteredUser(message, phoneNumber, text);
            return;
        }

        // Handle registered user
        await this.handleRegisteredUser(message, user, text);
    }

    async handleUnregisteredUser(message, phoneNumber, text) {
        const session = this.userSessions.get(phoneNumber) || {};
        
        if (!session.waitingForCode) {
            await message.reply('👋 שלום! אנא הזן את הקוד האישי שלך:');
            this.userSessions.set(phoneNumber, { waitingForCode: true });
            return;
        }

        // User sent a code
        const user = await this.getUserByCode(text);
        if (!user) {
            await message.reply('❌ קוד שגוי. נסה שוב:');
            return;
        }

        // Update user's phone number
        await this.updateUserPhone(user, phoneNumber);
        this.userSessions.delete(phoneNumber);
        
        await message.reply(`✅ נרשמת בהצלחה! שלום ${user.firstName} ${user.lastName}`);
        await this.showMainMenu(message);
    }

    async handleRegisteredUser(message, user, text) {
        const phoneNumber = user.phoneNumber;
        const session = this.userSessions.get(phoneNumber) || {};
        
        if (text === '1' || text.includes('נוכחות')) {
            await this.handleAttendanceReport(message, user);
        } else if (text === '2' || text.includes('נכס"ל שבת')) {
            await this.handleShabbatReport(message, user);
        } else if (text === '3' || text.includes('חירום')) {
            await this.handleEmergencyReport(message, user);
        } else if (user.permission === 'admin') {
            await this.handleAdminCommand(message, user, text);
        } else {
            await this.showMainMenu(message);
        }
    }

    async handleAttendanceReport(message, user) {
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 9) {
            await message.reply('❌ לא ניתן לדווח נוכחות לאחר השעה 09:00.');
            return;
        }

        const session = this.userSessions.get(user.phoneNumber) || {};
        
        if (!session.waitingForAttendance) {
            await message.reply(`📋 בחר סטטוס נוכחות:
            
1️⃣ נוכח
2️⃣ מחסר באישור  
3️⃣ מאחר באישור`);
            
            this.userSessions.set(user.phoneNumber, { 
                waitingForAttendance: true,
                reportType: 'attendance'
            });
            return;
        }

        let status;
        switch (message.body.trim()) {
            case '1':
                status = 'נוכח';
                break;
            case '2':
                status = 'מחסר באישור';
                break;
            case '3':
                status = 'מאחר באישור';
                break;
            default:
                await message.reply('❌ בחירה לא חוקית. נסה שוב.');
                return;
        }

        await this.saveReport(user.phoneNumber, 'attendance', status);
        this.userSessions.delete(user.phoneNumber);
        
        await message.reply(`✅ נוכחות דווחה: ${status}`);
        await this.showMainMenu(message);
    }

    async handleShabbatReport(message, user) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        
        if (dayOfWeek !== 4 && dayOfWeek !== 5) { // Thursday or Friday
            await message.reply('❌ דיווח נכס"ל שבת זמין רק בימי חמישי ושישי.');
            return;
        }

        const session = this.userSessions.get(user.phoneNumber) || {};
        
        if (!session.waitingForShabbat) {
            await message.reply(`🕯️ בחר מיקום לשבת:
            
1️⃣ בבית
2️⃣ מקום אחר (יש להזין מיקום)`);
            
            this.userSessions.set(user.phoneNumber, { 
                waitingForShabbat: true,
                reportType: 'shabbat'
            });
            return;
        }

        if (message.body.trim() === '1') {
            await this.saveReport(user.phoneNumber, 'shabbat', 'נוכח', 'בבית');
            this.userSessions.delete(user.phoneNumber);
            
            await message.reply('✅ דיווח שבת נשמר: בבית');
            await this.showMainMenu(message);
        } else if (message.body.trim() === '2') {
            await message.reply('📍 אנא הזן את המיקום:');
            this.userSessions.set(user.phoneNumber, { 
                waitingForShabbatLocation: true,
                reportType: 'shabbat'
            });
        } else if (session.waitingForShabbatLocation) {
            const location = message.body.trim();
            await this.saveReport(user.phoneNumber, 'shabbat', 'נוכח', location);
            this.userSessions.delete(user.phoneNumber);
            
            await message.reply(`✅ דיווח שבת נשמר: ${location}`);
            await this.showMainMenu(message);
        } else {
            await message.reply('❌ בחירה לא חוקית. נסה שוב.');
        }
    }

    async handleEmergencyReport(message, user) {
        await this.saveReport(user.phoneNumber, 'emergency', 'דיווח חירום');
        await message.reply('🚨 דיווח חירום נשמר ונשלח למנהל.');
        
        // Notify admin immediately
        await this.notifyAdmin(`🚨 דיווח חירום מ-${user.firstName} ${user.lastName} (${user.phoneNumber})`);
        
        await this.showMainMenu(message);
    }

    async handleAdminCommand(message, user, text) {
        if (text === '4' || text.includes('דוח יומי')) {
            await this.generateDailyReport(message);
        } else if (text === '5' || text.includes('סטטיסטיקות')) {
            await this.sendStatistics(message);
        } else {
            await this.showAdminMenu(message);
        }
    }

    async showMainMenu(message) {
        const menuText = `📋 תפריט ראשי:

1️⃣ דיווח נוכחות
2️⃣ דיווח נכס"ל שבת  
3️⃣ דיווח חירום

בחר אפשרות:`;

        await message.reply(menuText);
    }

    async showAdminMenu(message) {
        const menuText = `👨‍💼 תפריט מנהל:

1️⃣ דיווח נוכחות
2️⃣ דיווח נכס"ל שבת
3️⃣ דיווח חירום
4️⃣ דוח יומי
5️⃣ סטטיסטיקות

בחר אפשרות:`;

        await message.reply(menuText);
    }

    async saveReport(phoneNumber, reportType, status, location = '', notes = '') {
        const now = new Date();
        const reportDate = now.toISOString().split('T')[0];
        const reportTime = now.toTimeString().split(' ')[0];
        
        // Delete existing report for today if exists
        await this.reportsSheet.loadCells();
        const rows = await this.reportsSheet.getRows();
        
        for (const row of rows) {
            if (row.phoneNumber === phoneNumber && 
                row.reportType === reportType && 
                row.reportDate === reportDate) {
                await row.delete();
                break;
            }
        }

        // Add new report
        await this.reportsSheet.addRow({
            phoneNumber,
            reportType,
            status,
            location,
            reportDate,
            reportTime,
            notes,
            updatedBy: phoneNumber
        });
    }

    async generateDailyReport(message) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const users = await this.usersSheet.getRows();
            const reports = await this.reportsSheet.getRows();
            
            // Create Excel workbook
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('דוח נוכחות יומי');
            
            // Headers
            worksheet.columns = [
                { header: 'שם פרטי', key: 'firstName', width: 15 },
                { header: 'שם משפחה', key: 'lastName', width: 15 },
                { header: 'נוכחות', key: 'attendance', width: 20 },
                { header: 'נכס"ל שבת', key: 'shabbat', width: 20 },
                { header: 'מיקום שבת', key: 'shabbatLocation', width: 20 },
                { header: 'הערות', key: 'notes', width: 30 }
            ];
            
            // Data
            for (const user of users) {
                const userReports = reports.filter(r => 
                    r.phoneNumber === user.phoneNumber && 
                    r.reportDate === today
                );
                
                const attendanceReport = userReports.find(r => r.reportType === 'attendance');
                const shabbatReport = userReports.find(r => r.reportType === 'shabbat');
                
                worksheet.addRow({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    attendance: attendanceReport ? attendanceReport.status : 'מחסר',
                    shabbat: shabbatReport ? shabbatReport.status : 'לא דווח',
                    shabbatLocation: shabbatReport ? shabbatReport.location : '',
                    notes: ''
                });
            }
            
            // Save file
            const filename = `daily_report_${today}.xlsx`;
            const filepath = path.join(__dirname, filename);
            await workbook.xlsx.writeFile(filepath);
            
            // Send file
            const media = await this.client.sendMessage(message.from, 
                { attachment: filepath, caption: `📊 דוח יומי - ${today}` });
            
            // Clean up
            fs.unlinkSync(filepath);
            
            await message.reply('✅ דוח יומי נשלח בהצלחה!');
            
        } catch (error) {
            console.error('Error generating daily report:', error);
            await message.reply('❌ שגיאה ביצירת הדוח. נסה שוב מאוחר יותר.');
        }
    }

    async sendStatistics(message) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const users = await this.usersSheet.getRows();
            const reports = await this.reportsSheet.getRows();
            
            const todayReports = reports.filter(r => r.reportDate === today);
            const attendanceReports = todayReports.filter(r => r.reportType === 'attendance');
            
            const present = attendanceReports.filter(r => r.status === 'נוכח').length;
            const absent = attendanceReports.filter(r => r.status === 'מחסר באישור').length;
            const late = attendanceReports.filter(r => r.status === 'מאחר באישור').length;
            const notReported = users.length - attendanceReports.length;
            
            const statsText = `📊 סטטיסטיקות יומיות (${today}):

👥 סה"כ משתמשים: ${users.length}
✅ נוכחים: ${present}
❌ מחסרים: ${absent}
⏰ מאחרים: ${late}
⚠️ לא דיווחו: ${notReported}

📈 אחוז נוכחות: ${Math.round((present / users.length) * 100)}%`;

            await message.reply(statsText);
            
        } catch (error) {
            console.error('Error generating statistics:', error);
            await message.reply('❌ שגיאה בהפקת הסטטיסטיקות.');
        }
    }

    async getUserByPhone(phoneNumber) {
        const rows = await this.usersSheet.getRows();
        return rows.find(row => row.phoneNumber === phoneNumber);
    }

    async getUserByCode(code) {
        const rows = await this.usersSheet.getRows();
        return rows.find(row => row.personalCode === code);
    }

    async updateUserPhone(user, phoneNumber) {
        user.phoneNumber = phoneNumber;
        user.updatedAt = new Date().toISOString();
        await user.save();
    }

    async getCurrentAdmin() {
        if (!this.currentAdmin) {
            const rows = await this.usersSheet.getRows();
            this.currentAdmin = rows.find(row => row.permission === 'admin');
        }
        return this.currentAdmin;
    }

    async notifyAdmin(message) {
        try {
            const admin = await this.getCurrentAdmin();
            if (admin && admin.phoneNumber) {
                await this.client.sendMessage(admin.phoneNumber + '@c.us', message);
            }
        } catch (error) {
            console.error('Error notifying admin:', error);
        }
    }

    setupCronJobs() {
        // Daily reminder at 08:50
        cron.schedule('50 8 * * *', async () => {
            await this.sendDailyReminder();
        }, {
            timezone: 'Asia/Jerusalem'
        });

        // Auto daily report at 09:00 (optional)
        cron.schedule('0 9 * * *', async () => {
            const admin = await this.getCurrentAdmin();
            if (admin && admin.phoneNumber) {
                const message = { from: admin.phoneNumber + '@c.us' };
                await this.generateDailyReport(message);
            }
        }, {
            timezone: 'Asia/Jerusalem'
        });
    }

    async sendDailyReminder() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const users = await this.usersSheet.getRows();
            const reports = await this.reportsSheet.getRows();
            
            const todayReports = reports.filter(r => 
                r.reportDate === today && r.reportType === 'attendance'
            );
            
            const reportedPhones = new Set(todayReports.map(r => r.phoneNumber));
            
            for (const user of users) {
                if (!reportedPhones.has(user.phoneNumber) && user.phoneNumber) {
                    const reminderText = `⏰ תזכורת: עד כה לא דיווחת נוכחות היום. 
                    
הדיווח נסגר בשעה 09:00.
                    
לדיווח, שלח הודעה כלשהי.`;
                    
                    await this.client.sendMessage(user.phoneNumber + '@c.us', reminderText);
                }
            }
            
            console.log(`✅ Daily reminders sent to ${users.length - reportedPhones.size} users`);
            
        } catch (error) {
            console.error('Error sending daily reminders:', error);
        }
    }
}

// Initialize bot
const bot = new WhatsAppAttendanceBot();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('👋 Shutting down bot...');
    await bot.notifyAdmin('👋 Bot is shutting down...');
    process.exit(0);
});

module.exports = WhatsAppAttendanceBot;