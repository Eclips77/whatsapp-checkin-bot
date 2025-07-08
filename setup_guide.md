# 🚀 WhatsApp Attendance Bot - מדריך הקמה

## 📋 דרישות מוקדמות

### 1. Node.js
```bash
# הורד והתקן Node.js גרסה 16 או חדשה יותר
# https://nodejs.org/
node --version  # בדיקה שההתקנה עבדה
```

### 2. Google Sheets API
1. עבור ל-[Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט חדש או בחר קיים
3. הפעל את Google Sheets API
4. צור Service Account:
   - IAM & Admin > Service Accounts
   - Create Service Account
   - הורד את קובץ ה-JSON
5. שתף את הגיליון עם כתובת המייל של ה-Service Account

### 3. Google Sheets Setup
צור גיליון Google Sheets חדש עם שני גליונות:

#### גיליון "Users":
| firstName | lastName | personalCode | phoneNumber | permission | createdAt | updatedAt |
|-----------|----------|-------------|-------------|------------|-----------|-----------|
| יוסי      | כהן     | 1234        |             | user       | 2024-01-01| 2024-01-01|
| משה      | לוי     | 5678        |             | admin      | 2024-01-01| 2024-01-01|

#### גיליון "Reports":
| phoneNumber | reportType | status | location | reportDate | reportTime | notes | updatedBy |
|-------------|------------|--------|----------|------------|------------|-------|-----------|
| (ריק - יתמלא אוטומטית) | | | | | | | |

---

## 🔧 התקנה

### 1. הורד את הפרויקט
```bash
# צור תיקיה חדשה
mkdir whatsapp-attendance-bot
cd whatsapp-attendance-bot

# העתק את הקבצים:
# - index.js (הקוד הראשי)
# - package.json
# - .env.example
```

### 2. התקן תלות
```bash
npm install
```

### 3. הגדרות סביבה
```bash
# העתק את קובץ הדוגמה
cp .env.example .env

# ערוך את הקובץ
nano .env
```

הזן את הפרטים:
- `GOOGLE_SHEET_ID`: מהכתובת של הגיליון (החלק בין `/d/` ל-`/edit`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: כתובת המייל מקובץ ה-JSON
- `GOOGLE_PRIVATE_KEY`: המפתח הפרטי מקובץ ה-JSON

### 4. הרצה ראשונית
```bash
npm start
```

יופיע QR Code - סרוק אותו עם WhatsApp שלך.

---

## 🌐 פריסה בענן

### Replit (חינמי)
1. צור חשבון ב-[Replit](https://replit.com/)
2. צור Repl חדש (Node.js)
3. העלה את הקבצים
4. הוסף את משתני הסביבה ב-Secrets
5. הרץ את הבוט

### Heroku (חינמי עם מגבלות)
```bash
# התקן Heroku CLI
heroku login
heroku create your-bot-name

# הוסף משתני סביבה
heroku config:set GOOGLE_SHEET_ID=your_sheet_id
heroku config:set GOOGLE_SERVICE_ACCOUNT_EMAIL=your_email
heroku config:set GOOGLE_PRIVATE_KEY="your_private_key"

# Deploy
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

### Railway (מומלץ)
1. צור חשבון ב-[Railway](https://railway.app/)
2. חבר את הפרויקט מ-GitHub
3. הוסף משתני סביבה
4. Deploy אוטומטי

---

## 📱 שימוש

### למשתמשים חדשים:
1. שליחת הודעה לבוט
2. הזנת קוד אישי
3. אישור רישום

### תפריט משתמש:
- **1** - דיווח נוכחות (עד 09:00)
- **2** - דיווח נכס"ל שבת (חמישי/שישי)
- **3** - דיווח חירום

### תפריט מנהל:
- **4** - דוח יומי (Excel)
- **5** - סטטיסטיקות

---

## 🔄 UptimeRobot (שמירה על בוט ער)

1. צור חשבון ב-[UptimeRobot](https://uptimerobot.com/)
2. צור Monitor חדש מסוג HTTP(s)
3. הזן את כתובת הבוט שלך
4. הגדר בדיקה כל 5 דקות

---

## 🛠️ תחזוקה

### לוגים
```bash
# הצגת לוגים
npm start

# עם nodemon לפיתוח
npm run dev
```

### עדכון נתונים
- עדכון משתמשים: ישירות בגיליון Google Sheets
- החלפת מנהל: שנה את שדה