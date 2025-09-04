import mongoose from 'mongoose';

const viewSchema = new mongoose.Schema(
  {
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    watchTime: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

viewSchema.index({ video: 1, user: 1 }, { unique: true });

export const View = mongoose.model('View', viewSchema);
