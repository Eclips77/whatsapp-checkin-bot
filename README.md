# WhatsApp Attendance Bot

![Node.js](https://img.shields.io/badge/Node.js-16.x-blue?style=for-the-badge&logo=node.js)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

A robust and reliable WhatsApp bot designed to automate attendance tracking, status reporting, and emergency alerts, using Google Sheets as a database.

## 🌟 Features

- **Automated User Registration**: New users can register themselves by providing a unique personal code.
- **Attendance Reporting**: Users can report their daily attendance status (Present, Absent, Late). Attendance reporting is time-limited (e.g., only before 09:00 AM).
- **Shabbat Status**: Users can report their location for Shabbat (e.g., "Home" or a custom location). This feature is available only on specific days of the week (Thursday/Friday).
- **Emergency Alerts**: A dedicated option for users to send an immediate emergency alert to the designated admin.
- **Admin Dashboard**: Admins have access to special commands:
  - **Daily Report**: Generate a daily attendance report in Excel format (`.xlsx`).
  - **Statistics**: Get real-time attendance statistics for the day.
- **Automated Reminders**: A cron job sends daily reminders to users who have not yet reported their attendance.
- **Google Sheets Integration**: All user data and reports are securely stored and managed in a Google Sheet, acting as a simple and effective database.

## 🛠️ Tech Stack

- **Backend**: Node.js
- **WhatsApp Integration**: `whatsapp-web.js`
- **Database**: Google Sheets API (`google-spreadsheet`)
- **Authentication**: Google JWT Auth (`google-auth-library`)
- **Scheduled Tasks**: `node-cron`
- **Excel Generation**: `exceljs`
- **Environment Management**: `dotenv`

## 📋 Prerequisites

Before you begin, ensure you have the following:

1.  **Node.js**: Version 16.x or higher.
2.  **Google Cloud Platform Account**:
    - A new or existing project.
    - **Google Sheets API** enabled for the project.
    - A **Service Account** with credentials (JSON file). The service account needs "Editor" permissions on the Google Sheet.

## ⚙️ Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd whatsapp-attendance-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Google Sheets:**
    Create a new Google Sheet and create two separate sheets (tabs) named `Users` and `Reports`.

    **`Users` sheet columns:**
    `firstName | lastName | personalCode | phoneNumber | permission | createdAt | updatedAt`

    **`Reports` sheet columns:**
    `phoneNumber | reportType | status | location | reportDate | reportTime | notes | updatedBy`

4.  **Configure Environment Variables:**
    Create a `.env` file in the root of the project. You can copy the `.env.example` if it exists.
    ```bash
    cp .env.example .env
    ```
    Add the following credentials to the `.env` file. These are obtained from your Google Cloud Service Account JSON file and the Google Sheet URL.

    ```env
    GOOGLE_SHEET_ID=your_google_sheet_id
    GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
    GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKey\n-----END PRIVATE KEY-----\n"
    ```
    - `GOOGLE_SHEET_ID`: You can find this in the URL of your Google Sheet (`/d/THIS_IS_THE_ID/edit`).
    - `GOOGLE_PRIVATE_KEY`: Remember to format the key with `\n` for newlines as shown above.

5.  **Share the Google Sheet:**
    Share your Google Sheet with the `GOOGLE_SERVICE_ACCOUNT_EMAIL` and give it "Editor" permissions.

## 🚀 Running the Bot

1.  **Start the bot:**
    ```bash
    npm start
    ```

2.  **Authenticate with WhatsApp:**
    On the first run, a QR code will be generated in your terminal. Scan this code with your WhatsApp mobile app (from `Linked Devices`) to connect the bot. A session file (`.wwebjs_auth/`) will be created to keep you logged in across restarts.

## 📱 Usage

### For New Users
1.  Send any message to the bot's WhatsApp number.
2.  The bot will ask for your personal code.
3.  Reply with the `personalCode` that has been pre-configured for you in the `Users` sheet.
4.  Once the code is verified, your WhatsApp number will be linked to your profile.

### Main Menu
Once registered, you will be presented with the main menu:
- `1️⃣ Attendance Report`: Report your presence for the day.
- `2️⃣ Shabbat Report`: Report your location for the upcoming Shabbat.
- `3️⃣ Emergency Report`: Send an emergency alert.

### Admin Menu
If your `permission` is set to `admin` in the `Users` sheet, you will have access to additional options:
- `4️⃣ Daily Report`: Receive an Excel file with the day's attendance records.
- `5️⃣ Statistics`: Receive a text summary of the day's attendance statistics.

## 📁 Project Structure

```
.
├── .wwebjs_auth/       # WhatsApp session data (auto-generated)
├── node_modules/       # Project dependencies
├── healthcheck.js      # A simple script to check the bot's health
├── package.json        # Project dependencies and scripts
├── whatsapp_attendance_bot.js # The main application logic
└── README.md           # This file
```

## ☁️ Deployment

This bot can be deployed on any server that runs Node.js. Here are a few recommended options:

- **VPS (e.g., DigitalOcean, Linode)**: Offers the most control. You can use a process manager like `pm2` to keep the bot running.
- **Platform as a Service (PaaS)**:
  - **Railway**: Recommended for ease of use. Connect your GitHub repository for automatic deployments.
  - **Heroku**: A popular choice, though with some limitations on free tiers.
- **Replit**: A simple, browser-based environment suitable for quick deployment and testing.

To keep the bot alive on free platforms, consider using a service like **UptimeRobot** to send periodic HTTP requests to a health-check endpoint.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements, please feel free to open an issue or submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

This project is distributed under the MIT License. See `LICENSE` for more information.
