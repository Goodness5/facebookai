import { IPropertyRequest } from '../models/property-request';
import { IPropertyListing, PropertyListing } from '../models/property-listing';
import { WhatsAppBot } from './whatsapp-chat';
import nodemailer from 'nodemailer';
import '@types/nodemailer';
import { config } from '../config/config';

export class PropertyMatcher {
    private whatsappBot: WhatsAppBot;
    private emailTransporter: nodemailer.Transporter;

    constructor(whatsappBot: WhatsAppBot) {
        this.whatsappBot = whatsappBot;
        this.emailTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.email.address,
                pass: config.email.password
            }
        });
    }

    async findMatches(request: IPropertyRequest) {
        const matches = await PropertyListing.find({
            $and: [
                { price: { $lte: request.requirements.maxPrice } },
                { propertyType: request.requirements.propertyType },
                {
                    $or: request.requirements.preferredLocations.map(location => ({
                        location: { $regex: location, $options: 'i' }
                    }))
                }
            ]
        }).limit(5);

        if (matches.length > 0) {
            await this.notifyMatches(request, matches);
        }
    }

    private async notifyMatches(request: IPropertyRequest, matches: IPropertyListing[]) {
        // Create email content
        const emailHtml = this.createEmailTemplate(request, matches);
        
        // Send email
        if (request.requesterInfo.contact.includes('@')) {
            await this.emailTransporter.sendMail({
                from: config.email.address,
                to: request.requesterInfo.contact,
                subject: 'Property Matches Found! 🏠',
                html: emailHtml
            });
        }

        // Create WhatsApp message
        const whatsappMsg = this.createWhatsAppMessage(request, matches);
        await this.whatsappBot.notifyAllowedContacts(whatsappMsg);
    }

    private createEmailTemplate(request: IPropertyRequest, matches: IPropertyListing[]): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px; }
                .property-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .property-image { max-width: 100%; height: auto; border-radius: 5px; }
                .price { color: #4CAF50; font-size: 1.2em; font-weight: bold; }
                .location { color: #666; }
                .button { background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Property Matches Found! 🏠</h1>
                    <p>Based on your request for ${request.requirements.propertyType}</p>
                </div>
                
                ${matches.map(match => `
                    <div class="property-card">
                        <h2>${match.title}</h2>
                        ${match.images[0] ? `<img src="${match.images[0]}" class="property-image" />` : ''}
                        <p class="price">₦${match.price.toLocaleString()}</p>
                        <p class="location">📍 ${match.location}</p>
                        <p>${match.description}</p>
                        <a href="tel:${match.listerInfo.contact}" class="button">Contact Agent</a>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>
        `;
    }

    private createWhatsAppMessage(request: IPropertyRequest, matches: IPropertyListing[]): string {
        return `🏠 *Property Matches Found!*\n\n` +
            `For request: ${request.requirements.propertyType} in ${request.requirements.preferredLocations.join(', ')}\n\n` +
            matches.map(match => 
                `*${match.title}*\n` +
                `💰 ₦${match.price.toLocaleString()}\n` +
                `📍 ${match.location}\n` +
                `📞 Contact: ${match.listerInfo.contact}\n` +
                `-------------------`
            ).join('\n\n');
    }
} 