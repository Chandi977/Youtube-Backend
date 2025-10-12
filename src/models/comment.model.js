import mongoose, { Schema } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

const commentSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    video: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
    },
    tweet: {
      type: Schema.Types.ObjectId,
      ref: 'Tweet',
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null, // null means top-level comment
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Custom validator to ensure a comment belongs to either a video or a tweet
commentSchema.pre('validate', function (next) {
  if (!this.video && !this.tweet) {
    next(new Error('Comment must be associated with a video or a tweet.'));
  } else if (this.video && this.tweet) {
    next(
      new Error('Comment cannot be associated with both a video and a tweet.')
    );
  } else {
    next();
  }
});
// Virtual field for replies
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parent',
});

// Plugin for pagination
commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model('Comment', commentSchema);
