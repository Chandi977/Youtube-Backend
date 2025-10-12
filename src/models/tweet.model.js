import mongoose, { Schema } from 'mongoose';

const tweetSchema = new Schema(
  {
    content: {
      type: String,
      trim: true,
      default: null, // allow image-only tweets
    },
    image: {
      type: {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
      default: undefined, // optional
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentTweet: {
      type: Schema.Types.ObjectId,
      ref: 'Tweet',
      default: null, // null means it's a top-level tweet
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
    shares: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// -------------------- Pre-validation --------------------
tweetSchema.pre('validate', function (next) {
  if (!this.content && !this.image) {
    next(new Error('Tweet must have content or image'));
  } else {
    next();
  }
});

// -------------------- Indexes --------------------
tweetSchema.index({ owner: 1, createdAt: -1 }); // quick fetch by user timeline
tweetSchema.index({ parentTweet: 1, createdAt: 1 }); // quick fetch for replies

// -------------------- Virtuals --------------------
// Count number of replies for a tweet
tweetSchema.virtual('replyCount', {
  ref: 'Tweet',
  localField: '_id',
  foreignField: 'parentTweet',
  count: true,
});

export const Tweet = mongoose.model('Tweet', tweetSchema);
