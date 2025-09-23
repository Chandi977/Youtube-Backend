import mongoose, { Schema } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

const videoSchema = new Schema(
  {
    videoFile: {
      url: {
        type: String, // Set by worker after processing
        required: false,
      }, // Cloudinary secure URL
      public_id: {
        type: String, // Set by worker after processing
        required: false,
      }, // Cloudinary public_id for updates/deletes
      format: {
        type: String,
        default: 'mp4',
      }, // Video format
      streaming_profile: {
        type: String,
        default: 'hd',
      }, // Adaptive streaming profile
      eager: {
        type: Array,
        default: [],
      }, // Optional resolutions info from Cloudinary
    },
    thumbnail: {
      url: {
        type: String,
        required: true,
      },
      public_id: {
        type: String,
        required: true,
      },
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    }, // Duration in seconds
    viewsCount: {
      type: Number,
      default: 0,
    }, // Track views
    isPublished: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['processing', 'published', 'failed'],
      default: 'processing',
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model('Video', videoSchema);
