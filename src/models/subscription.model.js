import mongoose, { Schema } from 'mongoose';

const subscriptionSchema = new Schema(
  {
    subscriber: {
      type: Schema.Types.ObjectId, // jo subscribe kiya hai
      ref: 'User',
    },
    channel: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Indexes for fast lookups and to prevent duplicates
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });
subscriptionSchema.index({ channel: 1, createdAt: -1 });
subscriptionSchema.index({ subscriber: 1, createdAt: -1 });

export const Subscription = mongoose.model('Subscriptions', subscriptionSchema);
