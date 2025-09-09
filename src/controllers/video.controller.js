import mongoose, { isValidObjectId } from 'mongoose';
import { Video } from '../models/video.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import {
  redisGet,
  redisSet,
  redisIncr,
  redisSAdd,
  redisSMembers,
  isRedisEnabled,
} from '../utils/upstash.js';

/**
 * Helper: Get video by ID or throw error
 */
const getVideoOrFail = async (videoId) => {
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');
  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');
  return video;
};

/**
 * Helper: Upload file to Cloudinary safely
 */
const safeUpload = async (file) => {
  if (!file) return null;
  try {
    return await uploadOnCloudinary(file.path);
  } catch (error) {
    throw new ApiError(400, error?.message || 'Error while uploading file');
  }
};

/**
 * PUBLISH VIDEO
 */
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const videoFile = req.files?.['videoFile']?.[0] || req.file;
  const thumbnail = req.files?.['thumbnail']?.[0];

  if (!title?.trim() || !description?.trim() || !videoFile || !thumbnail) {
    throw new ApiError(400, 'All fields are required');
  }

  const videoFileUrl = await safeUpload(videoFile);
  const thumbnailUrl = await safeUpload(thumbnail);

  const newVideo = await Video.create({
    videoFile: {
      url: videoFileUrl.url,
      public_id: videoFileUrl.public_id,
    },
    thumbnail: {
      url: thumbnailUrl.url,
      public_id: thumbnailUrl.public_id,
    },
    title: title.trim(),
    description: description.trim(),
    duration: Math.round(videoFileUrl.duration || 0),
    owner: req.user._id,
    isPublished: true,
  });

  if (isRedisEnabled)
    await redisSAdd('videos:popular', newVideo._id.toString());

  return res
    .status(201)
    .json(new ApiResponse(201, newVideo, 'Video published successfully'));
});

/**
 * GET ALL VIDEOS WITH PAGINATION & FILTER
 */
const getAllVideos = asyncHandler(async (req, res) => {
  let {
    page = 1,
    limit = 10,
    query,
    sortBy = 'createdAt',
    sortType = 'desc',
    userId,
  } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  const matchCriteria = {};
  if (query) matchCriteria.title = { $regex: query, $options: 'i' };
  if (userId && isValidObjectId(userId))
    matchCriteria.owner = mongoose.Types.ObjectId(userId);

  const videos = await Video.find(matchCriteria)
    .sort({ [sortBy]: sortType === 'asc' ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const totalVideos = await Video.countDocuments(matchCriteria);

  return res.status(200).json({ videos, total: totalVideos });
});

/**
 * GET VIDEO BY ID WITH REDIS CACHE
 */
const getVideoById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (isRedisEnabled) {
    const cached = await redisGet(`video:${id}`);
    if (cached)
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
  }

  const video = await Video.findById(id).populate(
    'owner',
    'fullName username avatar'
  );
  if (!video) throw new ApiError(404, 'Video not found');

  if (isRedisEnabled)
    await redisSet(`video:${id}`, JSON.stringify(video), { EX: 3600 });

  res.status(200).json({ success: true, data: video });
});

/**
 * GET VIDEOS BY USER WITH CACHE
 */
const getVideosByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  if (isRedisEnabled) {
    const cached = await redisGet(`user:${userId}:videos`);
    if (cached)
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
  }

  const videos = await Video.find({ owner: userId })
    .select('_id title thumbnail likesCount viewsCount createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (isRedisEnabled)
    await redisSet(`user:${userId}:videos`, JSON.stringify(videos), {
      EX: 3600,
    });

  res.status(200).json({ success: true, data: videos });
});

/**
 * UPDATE VIDEO
 */
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);

  if (req.body.title) video.title = req.body.title;
  if (req.body.description) video.description = req.body.description;

  const newVideoFile = req.files?.['videoFile']?.[0] || req.file;
  const newThumbnail = req.files?.['thumbnail']?.[0];

  if (newVideoFile) {
    const uploaded = await safeUpload(newVideoFile);
    video.videoFile = { url: uploaded.url, public_id: uploaded.public_id };
    video.duration = Math.round(uploaded.duration || 0);
  }

  if (newThumbnail) {
    const uploaded = await safeUpload(newThumbnail);
    video.thumbnail = { url: uploaded.url, public_id: uploaded.public_id };
  }

  await video.save();
  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video updated successfully.'));
});

/**
 * DELETE VIDEO
 */
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);
  await video.deleteOne();
  res
    .status(200)
    .json(new ApiResponse(200, null, 'Video deleted successfully.'));
});

/**
 * TOGGLE PUBLISH STATUS
 */
const togglePublishStatus = asyncHandler(async (req, res) => {
  const video = await getVideoOrFail(req.params.videoId);
  video.isPublished = !video.isPublished;
  await video.save();
  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video publish status toggled.'));
});

/**
 * RECORD VIDEO VIEW WITH REDIS BUFFER
 */
const recordView = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  await getVideoOrFail(videoId);

  if (isRedisEnabled) {
    await redisIncr(`video:${videoId}:views`);
    await redisSAdd('videos:dirty', videoId);
  } else {
    await Video.findByIdAndUpdate(videoId, { $inc: { viewsCount: 1 } });
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, 'View recorded successfully'));
});

/**
 * GET POPULAR VIDEOS (REDIS FEED)
 */
const getPopularVideos = asyncHandler(async (req, res) => {
  let popularIds = [];
  if (isRedisEnabled) popularIds = await redisSMembers('videos:popular');

  let videos;
  if (popularIds.length) {
    videos = await Video.find({ _id: { $in: popularIds } })
      .select('_id title thumbnail likesCount viewsCount createdAt')
      .sort({ likesCount: -1, viewsCount: -1 })
      .lean();
  } else {
    videos = await Video.find({ isPublished: true })
      .select('_id title thumbnail likesCount viewsCount createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
  }

  res.status(200).json({ success: true, data: videos });
});

/**
 * SEARCH VIDEOS
 */
const searchVideos = asyncHandler(async (req, res) => {
  const { searchterm } = req.query;
  if (!searchterm) throw new ApiError(400, 'Please enter the search term.');

  const videos = await Video.find({
    $or: [
      { title: { $regex: searchterm, $options: 'i' } },
      { description: { $regex: searchterm, $options: 'i' } },
    ],
  }).lean();

  res.status(200).json(new ApiResponse(200, videos, 'Search results fetched.'));
});

// ✅ Clean export
export {
  publishAVideo,
  getAllVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  recordView,
  getPopularVideos,
  getVideosByUser,
  searchVideos,
  getVideoOrFail,
};
