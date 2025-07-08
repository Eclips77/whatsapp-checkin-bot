#!/bin/bash

# deploy.sh - Deployment script for WhatsApp Attendance Bot

set -e  # Exit on any error

echo "🚀 Starting deployment of WhatsApp Attendance Bot..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_status "Please copy .env.example to .env and configure your settings"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    print_status "Please install Node.js 16+ from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Node.js version $NODE_VERSION is too old. Required: $REQUIRED_VERSION+"
    exit 1
fi

print_status "Node.js version: $NODE_VERSION ✓"

# Install dependencies
print_status "Installing dependencies..."
npm ci --only=production

# Create necessary directories
print_status "Creating directories..."
mkdir -p logs
mkdir -p data

# Set permissions
print_status "Setting permissions..."
chmod 755 logs data

# Check Google Sheets connection
print_status "Testing Google Sheets connection..."
node -e "
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

async function testConnection() {
    try {
        const auth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
        await doc.loadInfo();
        console.log('✅ Google Sheets connection successful');
        console.log('📊 Sheet title:', doc.title);
    } catch (error) {
        console.error('❌ Google Sheets connection failed:', error.message);
        process.exit(1);
    }
}

testConnection();
"

if [ $? -ne 0 ]; then
    print_error "Google Sheets connection failed!"
    exit 1
fi

# Create systemd service file (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_status "Creating systemd service..."
    
    CURRENT_DIR=$(pwd)
    SERVICE_FILE="/etc/systemd/system/whatsapp-attendance-bot.service"
    
    sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=WhatsApp Attendance Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
ExecStart=$(which node) index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=whatsapp-bot

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable whatsapp-attendance-bot
    print_status "Systemd service created and enabled"
fi

# Create startup script
print_status "Creating startup script..."
cat > start.sh << 'EOF'
#!/bin/bash

# Start script for WhatsApp Attendance Bot
echo "🚀 Starting WhatsApp Attendance Bot..."

# Check if already running
if pgrep -f "node index.js" > /dev/null; then
    echo "⚠️  Bot is already running!"
    echo "📋 Process ID: $(pgrep -f 'node index.js')"
    exit 1
fi

# Start the bot
NODE_ENV=production node index.js
EOF

chmod +x start.sh

# Create stop script
print_status "Creating stop script..."
cat > stop.sh << 'EOF'
#!/bin/bash

# Stop script for WhatsApp Attendance Bot
echo "🛑 Stopping WhatsApp Attendance Bot..."

# Find and kill the process
PID=$(pgrep -f "node index.js")
if [ -z "$PID" ]; then
    echo "❌ Bot is not running"
    exit 1
fi

kill -SIGTERM $PID
echo "✅ Bot stopped (PID: $PID)"
EOF

chmod +x stop.sh

# Create restart script
print_status "Creating restart script..."
cat > restart.sh << 'EOF'
#!/bin/bash

# Restart script for WhatsApp Attendance Bot
echo "🔄 Restarting WhatsApp Attendance Bot..."

# Stop if running
./stop.sh 2>/dev/null

# Wait a moment
sleep 2

# Start again
./start.sh
EOF

chmod +x restart.sh

# Create backup script
print_status "Creating backup script..."
cat > backup.sh << 'EOF'
#!/bin/bash

# Backup script for WhatsApp Attendance Bot
BACKUP_DIR="backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.tar.gz"

echo "💾 Creating backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    --exclude="node_modules" \
    --exclude="logs" \
    --exclude="backups" \
    --exclude=".wwebjs_auth" \
    .

echo "✅ Backup created: $BACKUP_DIR/$BACKUP_FILE"
echo "📦 Size: $(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)"
EOF

chmod +x backup.sh

# Create update script
print_status "Creating update script..."
cat > update.sh << 'EOF'
#!/bin/bash

# Update script for WhatsApp Attendance Bot
echo "🔄 Updating WhatsApp Attendance Bot..."

# Create backup first
./backup.sh

# Pull latest changes (if using git)
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    git pull origin main
fi

# Update dependencies
echo "📦 Updating dependencies..."
npm ci --only=production

# Restart if running
if pgrep -f "node index.js" > /dev/null; then
    echo "🔄 Restarting bot..."
    ./restart.sh
else
    echo "ℹ️  Bot is not running, no restart needed"
fi

echo "✅ Update completed!"
EOF

chmod +x update.sh

# Final checks
print_status "Running final checks..."

# Check if all required files exist
REQUIRED_FILES=("index.js" "package.json" ".env")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        print_error "Required file missing: $file"
        exit 1
    fi
done

print_status "✅ All checks passed!"

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Run './start.sh' to start the bot"
echo "   2. Scan the QR code with WhatsApp"
echo "   3. Test with a user registration"
echo ""
echo "🔧 Management commands:"
echo "   ./start.sh    - Start the bot"
echo "   ./stop.sh     - Stop the bot"
echo "   ./restart.sh  - Restart the bot"
echo "   ./backup.sh   - Create backup"
echo "   ./update.sh   - Update the bot"
echo ""
echo "📊 Logs location: ./logs/"
echo "💾 Data location: ./data/"
echo ""

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Linux detected - systemd service available:"
    echo "   sudo systemctl start whatsapp-attendance-bot"
    echo "   sudo systemctl stop whatsapp-attendance-bot"
    echo "   sudo systemctl status whatsapp-attendance-bot"
    echo ""
fi

print_status "Happy bot running! 🤖"