import puppeteer, { Browser, Page } from 'puppeteer';
import { Property } from '../models/property';
import { config } from '../config/config';
import { EventEmitter } from 'events';
import { PropertyListing } from '../models/property-listing';
import { PropertyRequest } from '../models/property-request';
import { AIService } from './ai-service';
import { WhatsAppBot } from './whatsapp-chat';

interface ScrapedProperty {
    title: string;
    description: string;
    price: string;
    location: string;
    images: string[];
    sellerInfo: {
        name: string;
        contact: string;
        profileUrl: string;
    };
    postedDate: Date;
}

export class FacebookScraper extends EventEmitter {
    private browser: Browser | null = null;
    private aiService: AIService;
    private whatsappBot: WhatsAppBot;

    constructor(whatsappBot: WhatsAppBot) {
        super();
        this.aiService = new AIService();
        this.whatsappBot = whatsappBot;
        // Test event emitter
        setImmediate(() => {
            this.emit('status', 'FacebookScraper initialized');
        });
    }

    async initialize() {
        this.emit('status', 'Initializing browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.emit('status', 'Browser initialized');
    }

    async login() {
        try {
            if (!this.browser) {
                console.log('No browser instance, initializing...');
                await this.initialize();
            }
            if (!this.browser) throw new Error('Failed to initialize browser');
            if (!config.facebook.email || !config.facebook.password) {
                throw new Error('Facebook credentials not found in config');
            }

            console.log('Starting Facebook login process...');
            this.emit('status', 'Logging into Facebook...');
            const page = await this.browser.newPage();
            
            console.log('Navigating to Facebook login page...');
            await page.goto('https://www.facebook.com');
            
            console.log('Entering credentials...');
            await page.type('#email', config.facebook.email);
            await page.type('#pass', config.facebook.password);
            
            console.log('Clicking login button...');
            await page.click('[data-testid="royal_login_button"]');
            
            console.log('Waiting for navigation...');
            await page.waitForNavigation();
            
            console.log('Login successful');
            this.emit('status', 'Successfully logged into Facebook');
            return page;
        } catch (error) {
            console.error('Login error:', error);
            this.emit('error', error);
            throw error;
        }
    }

    private async analyzeListing(listing: ScrapedProperty) {
        const content = `
            Title: ${listing.title}
            Price: ${listing.price}
            Location: ${listing.location}
            Description: ${listing.description}
            Contact: ${listing.sellerInfo.contact}
            Posted by: ${listing.sellerInfo.name}
        `;

        const analysis = await this.aiService.analyzeProperty(content);
        return analysis;
    }

    private async notifyNewListing(listing: ScrapedProperty, analysis: string | null) {
        const message = `🏠 *New Property from Facebook!*\n\n` +
            `*${listing.title}*\n` +
            `💰 ${listing.price}\n` +
            `📍 ${listing.location}\n` +
            `👤 Contact: ${listing.sellerInfo.name}\n` +
            `📞 ${listing.sellerInfo.contact}\n\n` +
            `*AI Analysis:*\n${analysis || 'No analysis available'}\n` +
            `-------------------\n` +
            `🔗 Profile: ${listing.sellerInfo.profileUrl}`;

        await this.whatsappBot.notifyAllowedContacts(message);
    }

    async scrapePropertyListings(searchTerm: string) {
        try {
            this.emit('status', `Starting property listings search for: ${searchTerm}`);
            const page = await this.login();
            
            await page.goto(`https://www.facebook.com/marketplace/search?query=${encodeURIComponent(searchTerm)}`);
            await page.waitForSelector('[data-testid="marketplace_search_result_content"]');

            const listings = await page.evaluate(() => {
                const items = document.querySelectorAll('[data-testid="marketplace_search_result_content"]');
                return Array.from(items).map(item => {
                    const titleEl = item.querySelector('span') as HTMLElement;
                    const priceEl = item.querySelector('[data-testid="marketplace_search_result_price"]') as HTMLElement;
                    const locationEl = item.querySelector('[data-testid="marketplace_search_result_location"]') as HTMLElement;
                    const imageEl = item.querySelector('img') as HTMLImageElement;
                    const sellerEl = item.querySelector('.seller-info') as HTMLElement;
                    const descriptionEl = item.querySelector('.description') as HTMLElement;

                    return {
                        title: titleEl?.innerText || '',
                        description: descriptionEl?.innerText || '',
                        price: priceEl?.innerText || '',
                        location: locationEl?.innerText || '',
                        images: [imageEl?.src].filter(Boolean),
                        sellerInfo: {
                            name: sellerEl?.querySelector('.seller-name')?.textContent || 'Unknown',
                            contact: sellerEl?.querySelector('.seller-contact')?.textContent || '',
                            profileUrl: sellerEl?.querySelector('a')?.href || ''
                        },
                        postedDate: new Date()
                    } as ScrapedProperty;
                });
            });

            this.emit('status', `Found ${listings.length} listings. Processing...`);

            for (const listing of listings) {
                try {
                    // Analyze with AI
                    const analysis = await this.analyzeListing(listing);

                    // Save to database
                    const propertyListing = new PropertyListing({
                        source: 'facebook',
                        title: listing.title,
                        description: listing.description,
                        price: this.extractPrice(listing.price),
                        location: listing.location,
                        images: listing.images,
                        listerInfo: listing.sellerInfo,
                        postedDate: listing.postedDate,
                        metadata: { analysis }
                    });

                    await propertyListing.save();

                    // Notify via WhatsApp
                    await this.notifyNewListing(listing, analysis);

                    this.emit('status', `Processed listing: ${listing.title}`);
                } catch (error) {
                    console.error(`Error processing listing ${listing.title}:`, error);
                }
            }

            this.emit('status', 'Scraping completed successfully');
            return listings;
        } catch (error) {
            this.emit('error', error);
            console.error('Error scraping Facebook:', error);
            throw error;
        }
    }

    private extractPrice(priceStr: string): number {
        const matches = priceStr.match(/[\d,]+(?:\.\d{2})?/);
        return matches ? parseFloat(matches[0].replace(/,/g, '')) : 0;
    }

    async scrapePropertyRequests(searchTerm: string) {
        try {
            this.emit('status', `Starting property requests search for: ${searchTerm}`);
            const page = await this.login();
            
            // Search in Facebook groups or posts
            await page.goto(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(searchTerm)}`);
            
            const requests = await page.evaluate(() => {
                const posts = document.querySelectorAll('[data-testid="post_container"]');
                return Array.from(posts).map(post => {
                    const contentEl = post.querySelector('.userContent') as HTMLElement;
                    const posterEl = post.querySelector('.user-info') as HTMLElement;

                    return {
                        content: contentEl?.innerText || '',
                        requesterInfo: {
                            name: posterEl?.querySelector('.name')?.textContent || 'Unknown',
                            contact: posterEl?.querySelector('.contact')?.textContent || '',
                            profileUrl: posterEl?.querySelector('a')?.href || ''
                        },
                        postDate: post.querySelector('timestamp')?.textContent || new Date().toISOString()
                    };
                });
            });

            for (const request of requests) {
                // Use AI to analyze the request content
                const analysis = await this.aiService.analyzePropertyRequest(request.content);
                
                const propertyRequest = new PropertyRequest({
                    source: 'facebook',
                    requestType: analysis.type,
                    requirements: {
                        propertyType: analysis.propertyType,
                        maxPrice: analysis.maxPrice || 0,
                        preferredLocations: analysis.preferredLocations,
                        additionalRequirements: analysis.additionalRequirements
                    },
                    requesterInfo: request.requesterInfo,
                    requestDate: new Date(request.postDate),
                    status: 'active',
                    metadata: { analysis }
                });
                await propertyRequest.save();
            }

            return requests;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            this.emit('status', 'Closing browser...');
            await this.browser.close();
            this.browser = null;
            this.emit('status', 'Browser closed');
        }
    }
} 