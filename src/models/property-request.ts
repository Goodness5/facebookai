import mongoose, { Schema, Document } from 'mongoose';

export interface IPropertyRequest extends Document {
    source: 'facebook' | 'whatsapp';
    requestType: 'rent' | 'buy';
    requirements: {
        propertyType: string;
        maxPrice: number;
        minBedrooms?: number;
        preferredLocations: string[];
        additionalRequirements?: string;
    };
    requesterInfo: {
        name: string;
        contact: string;
        profileUrl?: string;
    };
    urgency?: 'high' | 'medium' | 'low';
    requestDate: Date;
    status: 'active' | 'fulfilled' | 'expired';
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const PropertyRequestSchema: Schema = new Schema({
    source: { type: String, required: true, enum: ['facebook', 'whatsapp'] },
    requestType: { type: String, required: true, enum: ['rent', 'buy'] },
    requirements: {
        propertyType: { type: String, required: true },
        maxPrice: { type: Number, required: true },
        minBedrooms: { type: Number },
        preferredLocations: [String],
        additionalRequirements: { type: String }
    },
    requesterInfo: {
        name: { type: String, required: true },
        contact: { type: String, required: true },
        profileUrl: { type: String }
    },
    urgency: { type: String, enum: ['high', 'medium', 'low'] },
    requestDate: { type: Date, required: true },
    status: { type: String, required: true, default: 'active', enum: ['active', 'fulfilled', 'expired'] },
    metadata: { type: Map, of: Schema.Types.Mixed }
}, { timestamps: true });

export const PropertyRequest = mongoose.model<IPropertyRequest>('PropertyRequest', PropertyRequestSchema); 