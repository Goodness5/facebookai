import mongoose, { Schema, Document } from 'mongoose';

export interface IProperty extends Document {
    source: 'facebook' | 'whatsapp';
    title: string;
    description: string;
    price: number;
    location: string;
    contact: string;
    images: string[];
    postedDate: Date;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const PropertySchema: Schema = new Schema({
    source: { type: String, required: true, enum: ['facebook', 'whatsapp'] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number },
    location: { type: String },
    contact: { type: String },
    images: [String],
    postedDate: { type: Date },
    metadata: { type: Map, of: Schema.Types.Mixed },
}, { timestamps: true });

export const Property = mongoose.model<IProperty>('Property', PropertySchema); 