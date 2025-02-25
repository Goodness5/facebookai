"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("./config/database");
const facebook_scraper_1 = require("./services/facebook-scraper");
const whatsapp_chat_1 = require("./services/whatsapp-chat");
const property_1 = require("./models/property");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Initialize services
const whatsappBot = new whatsapp_chat_1.WhatsAppBot(30);
const facebookScraper = new facebook_scraper_1.FacebookScraper(whatsappBot);
// Connect to MongoDB
(0, database_1.connectDatabase)();
// Add these event listeners after initializing services
facebookScraper.on('status', (status) => {
    console.log(`[Facebook Scraper] ${status}`);
});
facebookScraper.on('progress', (progress) => {
    console.log(`[Facebook Scraper] Progress: ${progress.percentage}% (${progress.current}/${progress.total})`);
});
facebookScraper.on('error', (error) => {
    console.error(`[Facebook Scraper] Error:`, error);
});
whatsappBot.on('status', (status) => {
    console.log(`[WhatsApp Bot] ${status}`);
});
whatsappBot.on('progress', (progress) => {
    console.log(`[WhatsApp Bot] Scan progress: ${progress.percentage}% (${progress.current}/${progress.total})`);
});
// Basic API endpoints
app.use(express_1.default.json());
app.post('/api/scrape', async (req, res) => {
    try {
        const { searchTerm } = req.body;
        const listings = await facebookScraper.scrapePropertyListings(searchTerm);
        res.json(listings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to scrape listings' });
    }
});
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        await whatsappBot.sendMessage(to, message);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }
});
app.get('/api/test', async (req, res) => {
    try {
        // Test MongoDB
        const count = await property_1.Property.countDocuments();
        // Test Facebook scraper
        const listings = await facebookScraper.scrapePropertyListings('apartment');
        res.json({
            status: 'ok',
            dbConnection: 'working',
            propertyCount: count,
            scrapedListings: listings.length,
            whatsappStatus: whatsappBot.isReady() ? 'connected' : 'waiting for QR scan',
            lastUpdate: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({ error: String(error) });
    }
});
// Add this new endpoint
app.get('/api/test/facebook', async (req, res) => {
    try {
        console.log('Starting Facebook test scrape...');
        const searchTerm = 'apartment for rent';
        // Enable more detailed logging
        facebookScraper.on('status', (status) => {
            console.log(`[Facebook Status] ${status}`);
            // Also send to client if using SSE
        });
        const listings = await facebookScraper.scrapePropertyListings(searchTerm);
        res.json({
            success: true,
            listingsFound: listings.length,
            listings: listings.slice(0, 5), // Send first 5 listings as sample
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Facebook scraper test error:', error);
        res.status(500).json({
            success: false,
            error: String(error),
            timestamp: new Date().toISOString()
        });
    }
});
// Add endpoint to trigger manual scan
app.post('/api/whatsapp/scan', async (req, res) => {
    try {
        await whatsappBot.startScan();
        res.json({ success: true, message: 'Scan started' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to start scan' });
    }
});
// Add this new endpoint
app.post('/api/whatsapp/auth', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }
        await whatsappBot.authenticateWithPhoneNumber(phoneNumber);
        res.json({
            success: true,
            message: 'Authentication process started. Check your WhatsApp for verification code.'
        });
    }
    catch (error) {
        console.error('WhatsApp authentication error:', error);
        res.status(500).json({
            error: 'Failed to authenticate with WhatsApp',
            details: String(error)
        });
    }
});
// Add this endpoint
app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        const groups = await whatsappBot.getAllGroups();
        res.json({
            success: true,
            groups: groups.map(g => ({
                name: g.name,
                id: g.id._serialized,
                unreadCount: g.unreadCount
            }))
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get groups' });
    }
});
// Add this endpoint
app.post('/api/whatsapp/join-group', async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) {
            return res.status(400).json({ error: 'Invite code is required' });
        }
        const groupId = await whatsappBot.joinGroup(inviteCode);
        const groupChat = await whatsappBot.getChatById(groupId);
        res.json({
            success: true,
            message: 'Successfully joined group',
            groupId: groupId
        });
    }
    catch (error) {
        res.status(500).json({
            error: 'Failed to join group',
            details: String(error)
        });
    }
});
// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Handle shutdown gracefully
process.on('SIGTERM', async () => {
    await facebookScraper.close();
    process.exit(0);
});
