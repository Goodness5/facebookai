import mongoose, { Schema, Document } from 'mongoose';

export interface IPropertyListing extends Document {
    source: 'facebook' | 'whatsapp';
    title: string;
    description: string;
    price: number;
    location: string;
    propertyType: string;
    bedrooms?: number;
    bathrooms?: number;
    listerInfo: {
        name: string;
        contact: string;
        profileUrl?: string;
    };
    images: string[];
    amenities: string[];
    postedDate: Date;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const PropertyListingSchema: Schema = new Schema({
    source: { type: String, required: true, enum: ['facebook', 'whatsapp'] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    location: { type: String, required: true },
    propertyType: { type: String },
    bedrooms: { type: Number },
    bathrooms: { type: Number },
    listerInfo: {
        name: { type: String, required: true },
        contact: { type: String, required: true },
        profileUrl: { type: String }
    },
    images: [String],
    amenities: [String],
    postedDate: { type: Date, required: true },
    metadata: { type: Map, of: Schema.Types.Mixed }
}, { timestamps: true });

export const PropertyListing = mongoose.model<IPropertyListing>('PropertyListing', PropertyListingSchema); 