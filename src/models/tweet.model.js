import mongoose, { Schema } from 'mongoose';

const tweetSchema = new Schema(
  {
    content: {
      type: String,
      trim: true,
      default: null, // allow image-only tweets
    },
    image: {
      type: String, // Cloudinary / S3 / local path
      default: null,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentTweet: {
      type: Schema.Types.ObjectId,
      ref: 'Tweet',
      default: null,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    shares: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

export const Tweet = mongoose.model('Tweet', tweetSchema);
