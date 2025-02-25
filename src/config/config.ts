import dotenv from 'dotenv';
dotenv.config();

export const config = {
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/property-ai',
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },
    facebook: {
        email: process.env.FACEBOOK_EMAIL,
        password: process.env.FACEBOOK_PASSWORD,
    },
    whatsapp: {
        phoneNumber: process.env.WHATSAPP_PHONE_NUMBER,
        sessionData: process.env.WHATSAPP_SESSION,
    },
    email: {
        address: process.env.EMAIL_ADDRESS || 'your-email@gmail.com',
        password: process.env.EMAIL_PASSWORD || 'your-app-specific-password'
    }
}; 