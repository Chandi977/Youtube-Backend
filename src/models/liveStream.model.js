import mongoose, { Schema } from 'mongoose';

const liveStreamSchema = new Schema(
  {
    streamKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String, // cloudinary url
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isLive: {
      type: Boolean,
      default: false,
      index: true,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
      index: true,
    },
    concurrentViewers: {
      type: Number,
      default: 0,
    },
    peakViewers: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Gaming',
        'Music',
        'Education',
        'Entertainment',
        'Sports',
        'Technology',
        'Travel',
        'Food',
        'Lifestyle',
        'News',
        'Other',
      ],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isPublished: {
      type: Boolean,
      default: true,
    },
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    streamUrl: {
      type: String,
      default: null, // HLS/DASH stream URL
    },
    streamSettings: {
      resolution: {
        type: String,
        enum: ['720p', '1080p', '1440p', '2160p'],
        default: '1080p',
      },
      bitrate: {
        type: Number,
        default: 2500, // kbps
      },
      fps: {
        type: Number,
        default: 30,
      },
      latency: {
        type: String,
        enum: ['low', 'normal', 'ultra-low'],
        default: 'normal',
      },
    },
    streamStats: {
      totalMessages: {
        type: Number,
        default: 0,
      },
      totalLikes: {
        type: Number,
        default: 0,
      },
      totalShares: {
        type: Number,
        default: 0,
      },
      avgWatchTime: {
        type: Number,
        default: 0,
      },
    },
    monetization: {
      enabled: {
        type: Boolean,
        default: false,
      },
      superChatEnabled: {
        type: Boolean,
        default: false,
      },
      donations: [
        {
          user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
          amount: Number,
          message: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
    moderators: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    bannedUsers: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        bannedAt: {
          type: Date,
          default: Date.now,
        },
        reason: String,
      },
    ],
    scheduledFor: {
      type: Date,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null, // URL to recorded version after stream ends
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
liveStreamSchema.index({ isLive: 1, createdAt: -1 });
liveStreamSchema.index({ owner: 1, isLive: 1 });
liveStreamSchema.index({ views: -1 });
liveStreamSchema.index({ scheduledFor: 1 });
liveStreamSchema.index({ category: 1, isLive: 1 });

// Pre-save middleware
liveStreamSchema.pre('save', function (next) {
  if (
    this.isModified('concurrentViewers') &&
    this.concurrentViewers > this.peakViewers
  ) {
    this.peakViewers = this.concurrentViewers;
  }
  next();
});

// Instance methods
liveStreamSchema.methods.startStream = function () {
  this.isLive = true;
  this.startTime = new Date();
  this.endTime = null;
  return this.save();
};

liveStreamSchema.methods.endStream = function () {
  this.isLive = false;
  this.endTime = new Date();
  if (this.startTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
  }
  return this.save();
};

liveStreamSchema.methods.addViewer = function () {
  this.concurrentViewers += 1;
  this.views += 1;
  if (this.concurrentViewers > this.peakViewers) {
    this.peakViewers = this.concurrentViewers;
  }
  return this.save();
};

liveStreamSchema.methods.removeViewer = function () {
  if (this.concurrentViewers > 0) {
    this.concurrentViewers -= 1;
  }
  return this.save();
};

export const LiveStream = mongoose.model('LiveStream', liveStreamSchema);
