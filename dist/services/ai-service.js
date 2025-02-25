"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const openai_1 = require("openai");
const config_1 = require("../config/config");
class AIService {
    constructor() {
        this.openai = new openai_1.OpenAI({
            apiKey: config_1.config.openai.apiKey
        });
    }
    async analyzeProperty(text) {
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a real estate expert. Analyze the following property listing."
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });
        return completion.choices[0].message.content;
    }
    async analyzePropertyRequest(text) {
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are a real estate expert. Analyze property requests and extract key information.
                    Always return a valid JSON object with these fields:
                    - type: either "rent" or "buy"
                    - propertyType: string (e.g., "land", "apartment", "house")
                    - maxPrice: number (if not specified, estimate based on market value or use 0)
                    - minBedrooms: number (optional)
                    - preferredLocations: array of strings
                    - additionalRequirements: string (combine all additional requirements into one string)
                    - urgency: "high", "medium", or "low"
                    Ensure all required fields are present and properly formatted.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });
        try {
            const content = completion.choices[0].message.content || "{}";
            const analysis = JSON.parse(content);
            // Ensure required fields exist with default values
            return {
                type: analysis.type || "buy",
                propertyType: analysis.propertyType || "unknown",
                maxPrice: analysis.maxPrice || 0,
                minBedrooms: analysis.minBedrooms || 0,
                preferredLocations: Array.isArray(analysis.preferredLocations) ?
                    analysis.preferredLocations :
                    [analysis.preferredLocations || "unknown"],
                additionalRequirements: Array.isArray(analysis.additionalRequirements) ?
                    analysis.additionalRequirements.join(", ") :
                    (analysis.additionalRequirements || ""),
                urgency: analysis.urgency || "medium"
            };
        }
        catch (error) {
            console.error('Error parsing AI response:', error);
            // Return default structure if parsing fails
            return {
                type: "buy",
                propertyType: "unknown",
                maxPrice: 0,
                minBedrooms: 0,
                preferredLocations: ["unknown"],
                additionalRequirements: text,
                urgency: "medium"
            };
        }
    }
}
exports.AIService = AIService;
