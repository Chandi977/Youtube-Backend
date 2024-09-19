import mongoose, { Schema } from 'mongoose'; // Import mongoose and Schema from mongoose for schema definition
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2'; // Import mongoose-aggregate-paginate for pagination

// Defining the schema for the Video model
const videoSchema = new Schema(
  {
    videoFile: {
      type: String, // Field type is String, storing the Cloudinary URL for the video file
      required: true, // This field is required
    },
    thumbnail: {
      type: String, // Field type is String, storing the Cloudinary URL for the video thumbnail
      required: true, // This field is required
    },
    title: {
      type: String, // Field type is String, storing the title of the video
      required: true, // This field is required
    },
    discription: {
      type: String, // Field type is String, storing the description of the video
      required: true, // This field is required
    },
    duration: {
      type: Number, // Field type is Number, storing the duration of the video in seconds
      required: true, // This field is required
    },
    view: {
      type: Number, // Field type is Number, storing the number of views for the video
      default: 0, // Default value is 0
    },
    isPublished: {
      type: Boolean, // Field type is Boolean, indicating whether the video is published or not
      default: true, // Default value is true
    },
    owner: {
      type: Schema.Types.ObjectId, // Field type is ObjectId, referencing the User who owns the video
      ref: 'User', // Reference to the User model
      required: true, // This field is required
    },
  },
  { timestamps: true } // Adding timestamps (createdAt and updatedAt) to the schema
);

// Applying the mongoose-aggregate-paginate plugin to the schema
videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model('Video', videoSchema); // Exporting the Video model based on the videoSchema
