"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
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
        address: process.env.EMAIL_ADDRESS || 'mypropoutai@gmail.com',
        password: process.env.EMAIL_PASSWORD || 'ycjcmmotwlauegou'
    }
};
