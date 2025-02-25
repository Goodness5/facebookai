import mongoose from 'mongoose';
import { config } from './config';

export async function connectDatabase() {
    try {
        await mongoose.connect(config.mongodb.uri);
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
} 