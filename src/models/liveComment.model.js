import mongoose, { Schema } from 'mongoose';

const liveCommentSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      maxLength: 500,
    },
    liveStream: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['regular', 'superchat', 'moderator', 'system'],
      default: 'regular',
    },
    superChatAmount: {
      type: Number,
      default: 0,
    },
    isHighlighted: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    replies: [
      {
        content: {
          type: String,
          required: true,
          maxLength: 300,
        },
        owner: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        isDeleted: {
          type: Boolean,
          default: false,
        },
      },
    ],
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
    },
    streamTimestamp: {
      type: Number, // seconds from stream start
      required: true,
    },
    metadata: {
      userBadges: [
        {
          type: String,
          enum: ['verified', 'moderator', 'subscriber', 'member', 'vip'],
        },
      ],
      messageColor: {
        type: String,
        default: '#000000',
      },
      platform: {
        type: String,
        enum: ['web', 'mobile', 'tablet'],
        default: 'web',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
liveCommentSchema.index({ liveStream: 1, createdAt: -1 });
liveCommentSchema.index({ liveStream: 1, isPinned: -1, createdAt: -1 });
liveCommentSchema.index({ owner: 1, liveStream: 1 });
liveCommentSchema.index({ type: 1, liveStream: 1, createdAt: -1 });
liveCommentSchema.index({ streamTimestamp: 1, liveStream: 1 });

// Pre-save middleware to update likes count
liveCommentSchema.pre('save', function (next) {
  if (this.isModified('likes')) {
    this.likesCount = this.likes.length;
  }
  next();
});

// Instance methods
liveCommentSchema.methods.addLike = function (userId) {
  if (!this.likes.includes(userId)) {
    this.likes.push(userId);
    this.likesCount = this.likes.length;
    return this.save();
  }
  return this;
};

liveCommentSchema.methods.removeLike = function (userId) {
  this.likes = this.likes.filter((id) => !id.equals(userId));
  this.likesCount = this.likes.length;
  return this.save();
};

liveCommentSchema.methods.addReply = function (content, ownerId) {
  this.replies.push({
    content,
    owner: ownerId,
    createdAt: new Date(),
  });
  return this.save();
};

liveCommentSchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.deletedBy = deletedBy;
  this.deletedAt = new Date();
  return this.save();
};

export const LiveComment = mongoose.model('LiveComment', liveCommentSchema);
