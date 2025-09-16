import fs from 'fs';
import mongoose, { isValidObjectId } from 'mongoose';
import { Video } from '../models/video.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../utils/cloudinary.js';
import {
  redisGet,
  redisSet,
  redisIncr,
  redisSAdd,
  redisSMembers,
  redisDel,
  isRedisEnabled,
} from '../utils/upstash.js';

// ====================== Helpers ======================

// Get video by ID or throw 404
const getVideoOrFail = async (videoId) => {
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');
  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');
  return video;
};

// Upload file safely
const safeUpload = async (file, type = 'image') => {
  if (!file) return null;
  try {
    return await uploadOnCloudinary(file.path, type);
  } catch (error) {
    throw new ApiError(400, error?.message || 'Error while uploading file');
  }
};

// Format video response
const formatVideo = (video) => ({
  ...video,
  videoFile: {
    url: video.videoFile.url,
    adaptive:
      video.videoFile.eager?.map((v) => ({
        url: v.secure_url,
        width: v.width,
        height: v.height,
        quality: v.quality,
      })) || [],
  },
});

// ====================== Controllers ======================

// GET ALL VIDEOS
const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query: searchQuery,
    sortBy = 'createdAt',
    sortType = 'desc',
    isPublished,
  } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const cacheKey = `videos:all:${pageNum}:${limitNum}:${searchQuery || ''}:${sortBy}:${sortType}:${isPublished || ''}`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
  }

  const matchCriteria = {};
  if (searchQuery) matchCriteria.title = { $regex: searchQuery, $options: 'i' };
  if (isPublished !== undefined)
    matchCriteria.isPublished = isPublished === 'true';

  const videos = await Video.find(matchCriteria)
    .populate('owner', 'username fullName avatar')
    .sort({ [sortBy]: sortType === 'asc' ? 1 : -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  if (!videos.length)
    return res
      .status(404)
      .json({ success: false, message: 'No videos found', data: [] });

  const formattedVideos = videos.map(formatVideo);
  const totalVideos = await Video.countDocuments(matchCriteria);

  const response = {
    videos: formattedVideos,
    total: totalVideos,
    page: pageNum,
    limit: limitNum,
  };

  if (isRedisEnabled) await redisSet(cacheKey, response, 300); // cache 5 mins

  res.status(200).json({
    success: true,
    message: 'Videos fetched successfully',
    data: response,
  });
});

// PUBLISH VIDEO
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const videoFile = req.files?.['videoFile']?.[0];
  const thumbnail = req.files?.['thumbnail']?.[0];

  if (!title?.trim() || !description?.trim() || !videoFile || !thumbnail)
    throw new ApiError(400, 'All fields are required');

  const uploadedThumb = await safeUpload(thumbnail, 'image');
  const uploadedVideo = await safeUpload(videoFile, 'video');

  const newVideo = await Video.create({
    title: title.trim(),
    description: description.trim(),
    owner: req.user._id,
    thumbnail: { url: uploadedThumb.url, public_id: uploadedThumb.public_id },
    videoFile: {
      url: uploadedVideo.url,
      public_id: uploadedVideo.public_id,
      eager: uploadedVideo.eager || [],
      streaming_profile: 'hd',
      duration: uploadedVideo.duration || 0,
    },
    isPublished: true,
  });

  if (isRedisEnabled)
    await redisSAdd('videos:popular', newVideo._id.toString());

  res
    .status(201)
    .json(new ApiResponse(201, newVideo, 'Video published successfully'));
});

// GET VIDEO BY ID (with caching)
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const cacheKey = `video:${videoId}`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
  }

  const video = await Video.findById(videoId).populate(
    'owner',
    'fullName username avatar'
  );
  if (!video) throw new ApiError(404, 'Video not found');

  const videoData = formatVideo(video.toObject());

  if (isRedisEnabled) await redisSet(cacheKey, videoData, 600); // cache 10 mins

  res.status(200).json({ success: true, data: videoData });
});

// GET VIDEOS BY USER
const getVideosByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  const cacheKey = `user:${userId}:videos`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });
  }

  const videos = await Video.find({ owner: userId })
    .select('_id title thumbnail likesCount viewsCount createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (isRedisEnabled) await redisSet(cacheKey, videos, 3600); // cache 1 hr

  res.status(200).json({ success: true, data: videos });
});

// UPDATE VIDEO
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);

  const { title, description } = req.body;
  const newVideoFile = req.files?.['videoFile']?.[0];
  const newThumbnail = req.files?.['thumbnail']?.[0];

  if (title?.trim()) video.title = title.trim();
  if (description?.trim()) video.description = description.trim();

  if (newVideoFile) {
    const uploadedVideo = await safeUpload(newVideoFile, 'video');
    if (video.videoFile?.public_id)
      await deleteFromCloudinary(video.videoFile.public_id, 'video');
    video.videoFile = {
      url: uploadedVideo.url,
      public_id: uploadedVideo.public_id,
      eager: uploadedVideo.eager || [],
      streaming_profile: 'hd',
      duration: uploadedVideo.duration || 0,
    };
  }

  if (newThumbnail) {
    const uploadedThumb = await safeUpload(newThumbnail, 'image');
    if (video.thumbnail?.public_id)
      await deleteFromCloudinary(video.thumbnail.public_id, 'image');
    video.thumbnail = {
      url: uploadedThumb.url,
      public_id: uploadedThumb.public_id,
    };
  }

  await video.save();

  if (isRedisEnabled) {
    await redisDel(`video:${videoId}`); // invalidate cache
    await redisDel(`user:${video.owner.toString()}:videos`);
  }

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video updated successfully'));
});

// DELETE VIDEO
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);

  if (video.videoFile?.public_id)
    await deleteFromCloudinary(video.videoFile.public_id, 'video');
  if (video.thumbnail?.public_id)
    await deleteFromCloudinary(video.thumbnail.public_id, 'image');

  await video.deleteOne();

  if (isRedisEnabled) {
    await redisDel(`video:${videoId}`);
    await redisDel(`user:${video.owner.toString()}:videos`);
    await redisSRem('videos:popular', videoId);
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Video deleted successfully'));
});

// RECORD VIEW
const recordView = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  await getVideoOrFail(videoId);

  if (isRedisEnabled) {
    await redisIncr(`video:${videoId}:views`);
    await redisSAdd('videos:dirty', videoId); // for batch DB update
  } else {
    await Video.findByIdAndUpdate(videoId, { $inc: { viewsCount: 1 } });
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, 'View recorded successfully'));
});

// GET POPULAR VIDEOS
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

// STREAM VIDEO (adaptive URLs)
const streamVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);

  const adaptiveStreams =
    video.videoFile.eager?.filter((v) => v.format === 'mp4') || [];
  if (!adaptiveStreams.length) {
    return res.status(200).json({
      success: true,
      data: { url: video.videoFile.url },
      message: 'Video URL fetched, adaptive streams pending',
    });
  }

  const streams = adaptiveStreams.map((v) => ({
    url: v.secure_url,
    width: v.width,
    height: v.height,
    quality: v.quality,
  }));

  res.status(200).json({
    success: true,
    data: { streams },
    message: 'Adaptive video streams fetched successfully',
  });
});

// SEARCH VIDEOS
const searchVideos = asyncHandler(async (req, res) => {
  const { searchterm } = req.query;
  if (!searchterm) throw new ApiError(400, 'Please enter the search term.');

  const cacheKey = `videos:search:${searchterm}`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(200, cached, 'Search results fetched from cache')
        );
  }

  const videos = await Video.find({
    $or: [
      { title: { $regex: searchterm, $options: 'i' } },
      { description: { $regex: searchterm, $options: 'i' } },
    ],
  }).lean();

  if (isRedisEnabled) await redisSet(cacheKey, videos, 300); // cache 5 mins

  res.status(200).json(new ApiResponse(200, videos, 'Search results fetched.'));
});

// TOGGLE PUBLISH STATUS
const togglePublishStatus = asyncHandler(async (req, res) => {
  const video = await getVideoOrFail(req.params.videoId);
  video.isPublished = !video.isPublished;
  await video.save();

  if (isRedisEnabled) {
    await redisDel(`video:${video._id}`); // invalidate cache
    await redisDel(`user:${video.owner.toString()}:videos`);
    if (video.isPublished) {
      await redisSAdd('videos:popular', video._id.toString());
    } else {
      await redisSRem('videos:popular', video._id.toString());
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video publish status toggled.'));
});

export {
  publishAVideo,
  getAllVideos,
  getVideoById,
  getVideosByUser,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  recordView,
  getPopularVideos,
  searchVideos,
  getVideoOrFail,
  streamVideo,
};
