// src/utils/video.utils.js
import { Video } from '../models/video.model.js';
// import { View } from '../models/view.model.js';
// import { VideoLike } from '../models/videoLike.model.js';
import { ApiError } from './ApiError.js';
import { asyncHandler } from './asyncHandler.js';

export const getVideos = asyncHandler(async (Model, req, res, next) => {
  const userId = req.user._id;

  // Find video IDs liked or viewed by the user
  const records = await Model.find({ userId }).select('videoId');

  if (!records.length) {
    throw new ApiError(404, 'No videos found for this user.');
  }

  const videoIds = records.map((r) => r.videoId);

  // Fetch videos with owner info
  const videos = await Video.find({ _id: { $in: videoIds } }).populate(
    'owner',
    'fullName username avatar'
  );

  return res.status(200).json({
    success: true,
    data: videos,
  });
});
