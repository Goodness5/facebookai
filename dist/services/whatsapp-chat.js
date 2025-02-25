"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppBot = void 0;
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const ai_service_1 = require("./ai-service");
const property_listing_1 = require("../models/property-listing");
const property_request_1 = require("../models/property-request");
const events_1 = require("events");
class WhatsAppBot extends events_1.EventEmitter {
    constructor(scanIntervalMinutes = 30) {
        super();
        this.ready = false;
        this.scanInterval = null;
        this.isScanning = false;
        this.allowedNumbers = [
            '2348136212877',
            '2349069946579',
            '2349061108894'
        ];
        this.allowedGroups = [
            'PropOut Agents Group',
            'PropOut',
            'CwgQPMP75lyII0pwttCf6f'
        ];
        this.MAX_MESSAGE_LENGTH = 16000; // Safe limit for MongoDB
        this.MAX_IMAGE_SIZE = 5242880; // 5MB limit
        this.client = new whatsapp_web_js_1.Client({
            authStrategy: new whatsapp_web_js_1.LocalAuth(),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            }
        });
        this.aiService = new ai_service_1.AIService();
        this.initialize();
        if (scanIntervalMinutes > 0) {
            this.startPeriodicScan(scanIntervalMinutes);
        }
    }
    async authenticateWithPhoneNumber(phoneNumber) {
        try {
            this.emit('status', `Starting WhatsApp authentication for: ${phoneNumber}`);
            // Don't create a new client, use the existing one
            if (!this.client.pupPage) {
                await this.client.initialize();
            }
            this.emit('status', 'Please scan the QR code when it appears');
            return true;
        }
        catch (error) {
            console.error('Authentication error:', error);
            this.emit('error', `Failed to authenticate: ${error}`);
            // Try to recover
            try {
                if (this.client.pupPage) {
                    await this.client.pupPage.reload();
                }
            }
            catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
            throw error;
        }
    }
    initialize() {
        this.emit('status', 'Initializing WhatsApp client...');
        this.client.on('qr', (qr) => {
            this.emit('status', 'QR Code received, please scan');
            qrcode_terminal_1.default.generate(qr, { small: true });
        });
        this.client.on('ready', () => {
            this.ready = true;
            this.emit('status', 'WhatsApp client is ready');
            // Immediately check for groups when ready
            this.getAllGroups().then(groups => {
                console.log(`Client ready. Found ${groups.length} groups.`);
            });
        });
        this.client.on('authenticated', () => {
            this.emit('status', 'WhatsApp client authenticated');
        });
        this.client.on('auth_failure', (msg) => {
            this.emit('error', `Authentication failed: ${msg}`);
        });
        // Initialize with retry
        this.initializeWithRetry();
        this.client.on('disconnected', async (reason) => {
            this.ready = false;
            this.emit('status', `WhatsApp disconnected: ${reason}`);
            // Wait before trying to reconnect
            await new Promise(resolve => setTimeout(resolve, 5000));
            try {
                await this.client.destroy();
                await this.client.initialize();
            }
            catch (error) {
                this.emit('error', `Failed to reconnect: ${error}`);
            }
        });
        this.client.on('message', async (message) => {
            this.emit('status', `Received message: ${message.body.substring(0, 50)}...`);
            await this.handleMessage(message);
        });
        this.client.on('group_join', async (notification) => {
            this.emit('status', `Joined new group: ${notification.chatId}`);
            const chat = await this.client.getChatById(notification.chatId);
            await this.scanChat(chat);
        });
        this.client.on('group_update', async (notification) => {
            this.emit('status', `Group updated: ${notification.chatId}`);
            const chat = await this.client.getChatById(notification.chatId);
            if (chat.isGroup) {
                await this.processGroupMetadata(chat);
            }
        });
    }
    async initializeWithRetry(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                console.log(`Attempting to initialize WhatsApp client (attempt ${i + 1}/${retries})`);
                await this.client.initialize();
                return;
            }
            catch (error) {
                console.error(`Initialization attempt ${i + 1} failed:`, error);
                if (i < retries - 1) {
                    console.log('Retrying in 5 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        throw new Error(`Failed to initialize after ${retries} attempts`);
    }
    isReady() {
        return this.ready;
    }
    truncateMessage(text) {
        if (text.length > this.MAX_MESSAGE_LENGTH) {
            return text.substring(0, this.MAX_MESSAGE_LENGTH) + '... (truncated)';
        }
        return text;
    }
    async notifyAllowedContacts(message) {
        const truncatedMsg = this.truncateMessage(message);
        try {
            // Notify allowed numbers
            for (const number of this.allowedNumbers) {
                try {
                    await this.sendMessage(`${number}@c.us`, truncatedMsg);
                    console.log(`Message sent to number: ${number}`);
                }
                catch (error) {
                    console.error(`Failed to notify number ${number}:`, error);
                }
            }
            // Get all chats and find groups
            const allChats = await this.client.getChats();
            const groups = allChats.filter(chat => chat.isGroup);
            console.log('\n=== Attempting to send to groups ===');
            console.log('Message:', truncatedMsg.substring(0, 50) + '...');
            console.log('Found groups:', groups.length);
            for (const group of groups) {
                console.log(`\nChecking group: "${group.name}"`);
                console.log('Group ID:', group.id._serialized);
                // Direct name check
                const groupName = group.name?.toLowerCase().trim() || '';
                const matchedName = this.allowedGroups.find(allowed => groupName.includes(allowed.toLowerCase()));
                if (matchedName) {
                    console.log(`✓ Group "${group.name}" matched with "${matchedName}"`);
                    try {
                        await group.sendMessage(truncatedMsg);
                        console.log(`✓ Message sent successfully to "${group.name}"`);
                    }
                    catch (error) {
                        console.error(`✗ Failed to send to "${group.name}":`, error);
                    }
                }
                else {
                    console.log(`→ Group "${group.name}" not in allowed list`);
                }
            }
            console.log('\n=== Group messaging completed ===\n');
        }
        catch (error) {
            console.error('Error in notifyAllowedContacts:', error);
            this.emit('error', `Failed to send notifications: ${error}`);
        }
    }
    async handleMessage(message) {
        const messageContent = message.body.toLowerCase();
        const contact = await message.getContact();
        const chat = await message.getChat();
        try {
            if (this.isPropertyListing(messageContent)) {
                await this.handlePropertyListing(message, contact);
                // Only reply to sender if they're in allowed list
                if (this.isAllowedNumber(contact.id.user) || this.isAllowedGroup(chat)) {
                    await message.reply('Thank you for sharing your property listing. I have analyzed and saved it.');
                }
            }
            else if (this.isPropertyRequest(messageContent)) {
                await this.handlePropertyRequest(message, contact);
                // Only reply to sender if they're in allowed list
                if (this.isAllowedNumber(contact.id.user) || this.isAllowedGroup(chat)) {
                    const analysis = await this.aiService.analyzePropertyRequest(message.body);
                    const reply = `Thank you for your property request. I have recorded:
- Type: ${analysis.type}
- Property: ${analysis.propertyType}
- Location(s): ${analysis.preferredLocations.join(', ')}
- Requirements: ${analysis.additionalRequirements}
- Urgency: ${analysis.urgency}

I will notify you when matching properties become available.`;
                    await message.reply(reply);
                }
            }
        }
        catch (error) {
            console.error('Error handling message:', error);
            if (this.isAllowedNumber(contact.id.user) || this.isAllowedGroup(chat)) {
                await message.reply('Sorry, I encountered an error processing your message.');
            }
        }
    }
    isPropertyListing(content) {
        const listingKeywords = ['for rent', 'for sale', 'available', 'property', 'apartment', 'house'];
        return listingKeywords.some(keyword => content.includes(keyword));
    }
    isPropertyRequest(content) {
        const requestKeywords = ['looking for', 'wanted', 'need', 'searching for', 'request'];
        return requestKeywords.some(keyword => content.includes(keyword));
    }
    extractPrice(text) {
        try {
            // Look for price patterns
            const patterns = [
                /(?:price|cost|rent):?\s*(?:₦|NGN)?\s*([\d,]+(?:\.\d{2})?)/i,
                /(?:₦|NGN)\s*([\d,]+(?:\.\d{2})?)/i,
                /([\d,]+(?:\.\d{2})?)\s*(?:naira|ngn)/i,
                /\b([\d,]+(?:\.\d{2})?)\b/ // fallback: just look for numbers
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    const cleanNumber = match[1].replace(/,/g, '');
                    const parsed = parseFloat(cleanNumber);
                    if (!isNaN(parsed) && parsed > 0) {
                        return parsed;
                    }
                }
            }
            // If no valid price found, log and return default
            console.log('No valid price found in text:', text);
            return 0;
        }
        catch (error) {
            console.error('Error extracting price:', error);
            return 0;
        }
    }
    extractLocation(text) {
        // Simple location extraction - can be enhanced with AI or location API
        const locationKeywords = ['in', 'at', 'near', 'around', 'located'];
        for (const keyword of locationKeywords) {
            const pattern = new RegExp(`${keyword}\\s+([^,.]+)`, 'i');
            const match = text.match(pattern);
            if (match)
                return match[1].trim();
        }
        return 'Unknown Location';
    }
    async handlePropertyListing(message, contact) {
        try {
            this.emit('status', 'Processing property listing...');
            const truncatedBody = this.truncateMessage(message.body);
            const extractedPrice = this.extractPrice(truncatedBody);
            if (extractedPrice === 0) {
                console.warn('Could not extract valid price from message:', truncatedBody);
            }
            // Analyze the listing using AI
            let analysis;
            try {
                analysis = await this.aiService.analyzeProperty(truncatedBody);
            }
            catch (aiError) {
                console.error('AI analysis failed:', aiError);
                analysis = 'AI analysis failed';
            }
            // Get media if available
            let images = [];
            if (message.hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    if (media?.data) {
                        const imageSize = Buffer.from(media.data).length;
                        if (imageSize <= this.MAX_IMAGE_SIZE) {
                            images.push(media.data);
                        }
                        else {
                            console.warn(`Image skipped: too large (${imageSize} bytes)`);
                        }
                    }
                }
                catch (mediaError) {
                    console.error('Error downloading media:', mediaError);
                }
            }
            const propertyData = {
                source: 'whatsapp',
                title: truncatedBody.split('\n')[0]?.substring(0, 200) || 'Untitled Property',
                description: truncatedBody,
                price: extractedPrice,
                location: this.extractLocation(truncatedBody),
                listerInfo: {
                    name: (contact.pushname || contact.name || 'Unknown').substring(0, 100),
                    contact: contact.id.user,
                    profileUrl: ''
                },
                images: images,
                postedDate: new Date(),
                metadata: {
                    analysis: this.truncateMessage(analysis || ''),
                    originalLength: message.body.length,
                    rawPrice: truncatedBody.match(/(?:price|cost|rent|₦|NGN):?[^\n]*/i)?.[0] || 'No price found'
                }
            };
            console.log('Attempting to save property listing:', {
                ...propertyData,
                description: propertyData.description.substring(0, 100) + '...' // Truncate for logging
            });
            const propertyListing = new property_listing_1.PropertyListing(propertyData);
            await propertyListing.save();
            this.emit('status', 'Property listing saved successfully');
            const notificationMsg = `New Property Listing from ${contact.pushname || contact.number || 'Unknown'}:\n${this.truncateMessage(message.body)}`;
            await this.notifyAllowedContacts(notificationMsg);
        }
        catch (error) {
            const customError = error;
            const errorMessage = `Failed to process property listing: ${customError.message}`;
            console.error('Error in handlePropertyListing:', {
                error: customError,
                messageContent: message.body.substring(0, 100) + '...',
                contact: contact.id.user
            });
            this.emit('error', errorMessage);
            throw new Error(errorMessage);
        }
    }
    async handlePropertyRequest(message, contact) {
        try {
            this.emit('status', 'Processing property request...');
            // Truncate message body
            const truncatedBody = this.truncateMessage(message.body);
            // Analyze the request using AI
            const analysis = await this.aiService.analyzePropertyRequest(truncatedBody);
            // Ensure additionalRequirements is a string and truncated
            const additionalReqs = this.truncateMessage(typeof analysis.additionalRequirements === 'string'
                ? analysis.additionalRequirements
                : Array.isArray(analysis.additionalRequirements)
                    ? analysis.additionalRequirements.join(", ")
                    : String(analysis.additionalRequirements || ''));
            // Create and save property request
            const propertyRequest = new property_request_1.PropertyRequest({
                source: 'whatsapp',
                requestType: analysis.type,
                requirements: {
                    propertyType: analysis.propertyType?.substring(0, 100),
                    maxPrice: analysis.maxPrice || 0,
                    minBedrooms: analysis.minBedrooms,
                    preferredLocations: analysis.preferredLocations?.map((loc) => loc.substring(0, 100)).slice(0, 10),
                    additionalRequirements: additionalReqs
                },
                requesterInfo: {
                    name: (contact.pushname || contact.name || 'Unknown').substring(0, 100),
                    contact: contact.id.user,
                    profileUrl: ''
                },
                urgency: analysis.urgency,
                requestDate: new Date(),
                status: 'active',
                metadata: {
                    analysis: this.truncateMessage(JSON.stringify(analysis)),
                    originalLength: message.body.length
                }
            });
            await propertyRequest.save();
            this.emit('status', 'Property request saved successfully');
            // Notify allowed contacts with truncated message
            const notificationMsg = `New Property Request from ${contact.pushname || contact.number || 'Unknown'}:\n${truncatedBody}`;
            await this.notifyAllowedContacts(notificationMsg);
        }
        catch (error) {
            const customError = error;
            console.error('Error in handlePropertyRequest:', error);
            this.emit('error', `Failed to process property request: ${customError.message}`);
            throw error;
        }
    }
    async sendMessage(to, message) {
        try {
            const chat = await this.client.getChatById(to);
            await chat.sendMessage(message);
            this.emit('status', `Message sent to ${to}`);
        }
        catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
            throw error;
        }
    }
    startPeriodicScan(intervalMinutes) {
        this.scanInterval = setInterval(() => {
            if (this.ready && !this.isScanning) {
                this.scanAllChats();
            }
        }, intervalMinutes * 60 * 1000);
    }
    async scanAllChats() {
        if (this.isScanning) {
            this.emit('status', 'Scan already in progress');
            return;
        }
        try {
            this.isScanning = true;
            this.emit('status', 'Starting comprehensive chat scan...');
            // Get all chats (groups and individual)
            const chats = await this.client.getChats();
            let processedCount = 0;
            for (const chat of chats) {
                try {
                    await this.scanChat(chat);
                    processedCount++;
                    this.emit('progress', {
                        total: chats.length,
                        current: processedCount,
                        percentage: Math.round((processedCount / chats.length) * 100)
                    });
                }
                catch (error) {
                    console.error(`Error scanning chat ${chat.name}:`, error);
                }
            }
            this.emit('status', `Scan completed. Processed ${processedCount} chats`);
        }
        catch (error) {
            this.emit('error', `Scan failed: ${error}`);
            console.error('Scan failed:', error);
        }
        finally {
            this.isScanning = false;
        }
    }
    async scanChat(chat) {
        this.emit('status', `Scanning ${chat.isGroup ? 'group' : 'chat'}: ${chat.name}`);
        try {
            // Get recent messages
            const messages = await chat.fetchMessages({ limit: 100 });
            for (const message of messages) {
                // Skip messages older than 24 hours
                if (Date.now() - message.timestamp * 1000 > 24 * 60 * 60 * 1000) {
                    continue;
                }
                const messageContent = message.body.toLowerCase();
                const contact = await message.getContact();
                // Process message if it's property related
                if (this.isPropertyListing(messageContent)) {
                    await this.handlePropertyListing(message, contact);
                }
                else if (this.isPropertyRequest(messageContent)) {
                    await this.handlePropertyRequest(message, contact);
                }
            }
            // For groups, get additional metadata
            if (chat.isGroup) {
                await this.processGroupMetadata(chat);
            }
        }
        catch (error) {
            console.error(`Error processing chat ${chat.name}:`, error);
        }
    }
    async processGroupMetadata(group) {
        try {
            // Get group info
            const groupName = group.name || 'Unknown Group';
            const description = group.description || '';
            this.emit('status', `Processing group: ${groupName} (${group.participants?.length} participants)`);
            // Process real estate related groups
            if (this.isRealEstateGroup(groupName, description)) {
                this.emit('status', `Found real estate group: ${groupName}`);
                // Additional processing can be added here
            }
        }
        catch (error) {
            console.error(`Error processing group metadata: ${error}`);
        }
    }
    isRealEstateGroup(name, description) {
        const realEstateKeywords = [
            'property', 'real estate', 'housing', 'apartment',
            'rent', 'lease', 'accommodation', 'house'
        ];
        const content = (name + ' ' + description).toLowerCase();
        return realEstateKeywords.some(keyword => content.includes(keyword));
    }
    isAllowedNumber(number) {
        const standardizedNumber = number.startsWith('234') ? number : `234${number.replace(/^0+/, '')}`;
        return this.allowedNumbers.includes(standardizedNumber);
    }
    isAllowedGroup(chat) {
        if (!chat.isGroup)
            return false;
        // Check both group name and ID
        const groupId = chat.id._serialized;
        const groupName = chat.name?.toLowerCase().trim() || '';
        return this.allowedGroups.some(allowed => groupName.includes(allowed.toLowerCase()) ||
            groupId.includes(allowed));
    }
    // Add method to manually trigger a scan
    async startScan() {
        if (!this.ready) {
            throw new Error('WhatsApp client not ready');
        }
        await this.scanAllChats();
    }
    // Add method to stop periodic scanning
    stopPeriodicScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }
    async getAllGroups() {
        try {
            const allChats = await this.client.getChats();
            const groups = allChats.filter(chat => chat.isGroup);
            console.log('\n=== All WhatsApp Groups ===');
            groups.forEach((group, index) => {
                console.log(`
${index + 1}. Group Details:
   Name: ${group.name}
   ID: ${group.id._serialized}
   Is Muted: ${group.isMuted}
   Unread Messages: ${group.unreadCount}
-------------------`);
            });
            console.log(`\nTotal Groups Found: ${groups.length}\n`);
            return groups;
        }
        catch (error) {
            console.error('Error getting groups:', error);
            throw error;
        }
    }
    async joinGroup(inviteCode) {
        try {
            console.log(`Attempting to join group with invite code: ${inviteCode}`);
            const groupChat = await this.client.acceptInvite(inviteCode);
            console.log('Successfully joined group:', groupChat);
            return groupChat;
        }
        catch (error) {
            console.error('Failed to join group:', error);
            throw error;
        }
    }
    async getChatById(id) {
        return await this.client.getChatById(id);
    }
}
exports.WhatsAppBot = WhatsAppBot;
