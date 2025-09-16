const WhatsAppAttendanceBot = require('./whatsapp_attendance_bot.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('google-spreadsheet');
jest.mock('whatsapp-web.js', () => {
  const mockClient = {
    on: jest.fn(),
    initialize: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({}),
  };
  return {
    Client: jest.fn(() => mockClient),
    LocalAuth: jest.fn(),
  };
});
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));
jest.mock('fs');

describe('WhatsAppAttendanceBot', () => {
  let bot;
  let mockDoc;

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock GoogleSpreadsheet
    mockDoc = {
      loadInfo: jest.fn().mockResolvedValue(),
      sheetsByTitle: {
        'Users': {
          setHeaderRow: jest.fn().mockResolvedValue(),
          loadHeaderRow: jest.fn().mockResolvedValue(),
          getRows: jest.fn().mockResolvedValue([]),
        },
        'Reports': {
          setHeaderRow: jest.fn().mockResolvedValue(),
          loadHeaderRow: jest.fn().mockResolvedValue(),
          getRows: jest.fn().mockResolvedValue([]),
        },
      },
      addSheet: jest.fn(),
    };
    GoogleSpreadsheet.mockImplementation(() => mockDoc);

    // Set up environment variables
    process.env.GOOGLE_SHEET_ID = 'test-sheet-id';
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test-email@example.com';
    process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';

    // Instantiate the bot
    bot = new WhatsAppAttendanceBot();
    // Manually await initialization since constructor can't be async
    await bot.initializeBot();
  });

  describe('generateDailyReport', () => {
    it('should mark users who have not reported as "לא דווח" instead of "מחסר"', async () => {
      // Mock data
      const today = new Date().toISOString().split('T')[0];
      const mockUsers = [
        { phoneNumber: '111', firstName: 'John', lastName: 'Doe' },
        { phoneNumber: '222', firstName: 'Jane', lastName: 'Smith' },
      ];
      const mockReports = [
        { phoneNumber: '111', reportType: 'attendance', status: 'נוכח', reportDate: today },
      ];

      // Mock Google Sheets getRows
      mockDoc.sheetsByTitle['Users'].getRows.mockResolvedValue(mockUsers);
      mockDoc.sheetsByTitle['Reports'].getRows.mockResolvedValue(mockReports);

      // Mock ExcelJS
      const mockWorksheet = {
        columns: [],
        addRow: jest.fn(),
      };
      const mockWorkbook = {
        addWorksheet: jest.fn().mockReturnValue(mockWorksheet),
        xlsx: {
          writeFile: jest.fn().mockResolvedValue(),
        },
      };
      jest.spyOn(ExcelJS, 'Workbook').mockImplementation(() => mockWorkbook);

      // Mock fs.unlinkSync
      fs.unlinkSync.mockImplementation(() => {});

      // Mock the message object with a reply function
      const mockMessage = {
        from: 'admin_phone_number@c.us',
        reply: jest.fn().mockResolvedValue(true),
      };

      // Call the function
      await bot.generateDailyReport(mockMessage);

      // Assertions
      expect(mockWorksheet.addRow).toHaveBeenCalledTimes(2);

      // Check the data passed to addRow for the user who did NOT report (Jane Smith)
      const janeSmithRowData = mockWorksheet.addRow.mock.calls.find(call => call[0].firstName === 'Jane')[0];

      // This is the core of the bug. The current code will set it to 'מחסר'.
      // The test expects 'לא דווח', so it should fail.
      expect(janeSmithRowData.attendance).toBe('לא דווח');
    });
  });
});
