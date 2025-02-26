import express from 'express';
import { connectDatabase } from './config/database';
import { FacebookScraper } from './services/facebook-scraper';
import { WhatsAppBot } from './services/whatsapp-chat';
import { config } from './config/config';
import { Property } from './models/property';

const app = express();
const PORT = process.env.PORT || 8001;

// Initialize services
const whatsappBot = new WhatsAppBot(30);
const facebookScraper = new FacebookScraper(whatsappBot);

// Connect to MongoDB
connectDatabase();

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
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    try {
        const { searchTerm } = req.body;
        const listings = await facebookScraper.scrapePropertyListings(searchTerm);
        res.json(listings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to scrape listings' });
    }
});

app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        await whatsappBot.sendMessage(to, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }
});

app.get('/api/test', async (req, res) => {
    try {
        // Test MongoDB
        const count = await Property.countDocuments();
        
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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