import mongoose, { Schema } from 'mongoose';

const streamViewerSchema = new Schema(
  {
    liveStream: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    socketId: {
      type: String,
      required: true,
      //   index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    watchTime: {
      type: Number, // in seconds
      default: 0,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'smart-tv'],
      default: 'desktop',
    },
    quality: {
      type: String,
      enum: ['240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'],
      default: '720p',
    },
    location: {
      country: String,
      region: String,
      city: String,
    },
    engagement: {
      messagesCount: {
        type: Number,
        default: 0,
      },
      likesGiven: {
        type: Number,
        default: 0,
      },
      superChatsAmount: {
        type: Number,
        default: 0,
      },
      sharesCount: {
        type: Number,
        default: 0,
      },
    },
    isSubscriber: {
      type: Boolean,
      default: false,
    },
    isModerator: {
      type: Boolean,
      default: false,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    networkStats: {
      connectionType: {
        type: String,
        enum: ['wifi', '4g', '5g', 'ethernet', 'unknown'],
        default: 'unknown',
      },
      bandwidth: Number, // in kbps
      latency: Number, // in ms
      bufferingEvents: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
streamViewerSchema.index({ liveStream: 1, isActive: 1 });
streamViewerSchema.index({ user: 1, liveStream: 1 });
streamViewerSchema.index({ socketId: 1 }, { unique: true });
streamViewerSchema.index({ liveStream: 1, joinedAt: -1 });

// TTL index to automatically remove inactive viewers after 24 hours
streamViewerSchema.index(
  { leftAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { leftAt: { $exists: true } },
  }
);

// Pre-save middleware
streamViewerSchema.pre('save', function (next) {
  if (this.leftAt && this.joinedAt) {
    this.watchTime = Math.floor((this.leftAt - this.joinedAt) / 1000);
  }
  next();
});

// Instance methods
streamViewerSchema.methods.updateActivity = function () {
  this.lastSeen = new Date();
  this.isActive = true;
  return this.save();
};

streamViewerSchema.methods.leave = function () {
  this.leftAt = new Date();
  this.isActive = false;
  if (this.joinedAt) {
    this.watchTime = Math.floor((this.leftAt - this.joinedAt) / 1000);
  }
  return this.save();
};

streamViewerSchema.methods.incrementEngagement = function (type, amount = 1) {
  if (this.engagement.hasOwnProperty(type)) {
    this.engagement[type] += amount;
    return this.save();
  }
  return this;
};

// Static methods
streamViewerSchema.statics.getActiveViewers = function (liveStreamId) {
  return this.find({
    liveStream: liveStreamId,
    isActive: true,
  }).populate('user', 'username avatar fullName');
};

streamViewerSchema.statics.getViewerCount = function (liveStreamId) {
  return this.countDocuments({
    liveStream: liveStreamId,
    isActive: true,
  });
};

streamViewerSchema.statics.getViewerStats = function (liveStreamId) {
  return this.aggregate([
    { $match: { liveStream: mongoose.Types.ObjectId(liveStreamId) } },
    {
      $group: {
        _id: '$liveStream',
        totalViewers: { $sum: 1 },
        activeViewers: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
        },
        avgWatchTime: { $avg: '$watchTime' },
        totalWatchTime: { $sum: '$watchTime' },
        totalMessages: { $sum: '$engagement.messagesCount' },
        totalLikes: { $sum: '$engagement.likesGiven' },
        totalSuperChats: { $sum: '$engagement.superChatsAmount' },
      },
    },
  ]);
};

export const StreamViewer = mongoose.model('StreamViewer', streamViewerSchema);
