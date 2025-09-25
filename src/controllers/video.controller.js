import fs from 'fs';
import { isValidObjectId } from 'mongoose';
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
  redisExpire,
  redisSRem,
} from '../utils/upstash.js';
import { processVideoPipeline } from '../utils/videoProcessor.js';
import { videoQueue } from '../queues/videoQueue.js';
import { View } from '../models/view.model.js';
import { User } from '../models/user.model.js';

// Get video by ID or throw 404
const getVideoOrFail = async (videoId) => {
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');
  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');
  return video;
};

// Safe Cloudinary upload
const safeUpload = async (file, type = 'image') => {
  if (!file) return null;
  try {
    return await uploadOnCloudinary(file.path, type);
  } catch (err) {
    throw new ApiError(400, err?.message || `Error uploading ${type}`);
  }
};

// Format video response
const formatVideo = (video) => ({
  ...video,
  videoFile: {
    url: video.videoFile.url,
    adaptive: video.videoFile.eager || {}, // 'eager' is now an object
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
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  const cacheKey = `videos:all:${pageNum}:${limitNum}:${searchQuery || ''}:${sortBy}:${sortType}:${isPublished || ''}`;
  const cached = await redisGet(cacheKey);
  if (cached)
    return res.status(200).json({
      success: true,
      message: 'Videos fetched from cache',
      data: cached,
    });

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

  if (!videos.length) throw new ApiError(404, 'No videos found');

  const formattedVideos = videos.map(formatVideo);
  const totalVideos = await Video.countDocuments(matchCriteria);

  const response = {
    videos: formattedVideos,
    total: totalVideos,
    page: pageNum,
    limit: limitNum,
  };

  if (isRedisEnabled) await redisSet(cacheKey, response, 300);

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
    throw new ApiError(
      400,
      'Title, description, video file, and thumbnail are required'
    );

  let uploadedThumb = null;
  let videoRecord = null;

  try {
    // --- STEP 1: Upload thumbnail immediately for a better UX ---
    uploadedThumb = await safeUpload(thumbnail, 'image');
    if (!uploadedThumb?.secure_url)
      throw new ApiError(500, 'Thumbnail upload failed');

    // --- STEP 2: Create a placeholder video document in the database ---
    videoRecord = await Video.create({
      title: title.trim(),
      description: description.trim(),
      owner: req.user._id,
      status: 'processing',
      thumbnail: {
        url: uploadedThumb.secure_url,
        public_id: uploadedThumb.public_id,
      },
    });

    // --- STEP 3: Add video processing job to the queue ---
    const job = await videoQueue.add('video-processing', {
      videoLocalPath: videoFile.path,
      thumbnailLocalPath: thumbnail.path,
      userId: req.user._id.toString(),
      videoData: {
        videoId: videoRecord._id,
        title: videoRecord.title,
      },
    });

    // --- STEP 4: Respond to the client ---
    res.status(202).json(
      new ApiResponse(
        202,
        {
          jobId: job.id,
          video: videoRecord,
        },
        'Video is being processed. You will be notified upon completion.'
      )
    );
  } catch (err) {
    if (uploadedThumb?.public_id)
      await deleteFromCloudinary(uploadedThumb.public_id, 'image');
    throw err;
  } finally {
    // --- STEP 5: Cleanup temporary files ---
    if (videoFile?.path) await fs.unlink(videoFile.path).catch(() => {});
    if (thumbnail?.path) await fs.unlink(thumbnail.path).catch(() => {});
  }
});

// GET VIDEO BY ID
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const cacheKey = `video:${videoId}`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });
  }

  const video = await Video.findById(videoId).populate(
    'owner',
    'fullName username avatar'
  );
  if (!video) throw new ApiError(404, 'Video not found');

  const videoData = formatVideo(video.toObject());

  if (isRedisEnabled) await redisSet(cacheKey, videoData, 600);

  res.status(200).json({ success: true, data: videoData });
});

// GET VIDEOS BY USER
const getVideosByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  const cacheKey = `user:${userId}:videos`;
  const cached = await redisGet(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const videos = await Video.find({ owner: userId })
    .select('_id title thumbnail likesCount viewsCount createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (isRedisEnabled) await redisSet(cacheKey, videos, 3600);

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
    const hlsUrls = await processVideoPipeline(
      newVideoFile.path,
      Date.now().toString()
    );
    video.videoFile = {
      url: hlsUrls[0]?.url || '',
      eager: hlsUrls.map((v) => ({ secure_url: v.url, label: v.label })),
      streaming_profile: 'hd',
      duration: 0,
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
    await redisDel(`video:${videoId}`);
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
  const userId = req.user._id.toString();

  await getVideoOrFail(videoId);

  if (isRedisEnabled) {
    const userViewedKey = `video:${videoId}:viewed`;

    // Add user to set
    const added = await redisSAdd(userViewedKey, userId);

    if (added) {
      // Increment views
      await redisIncr(`video:${videoId}:views`);

      // Mark video as dirty for eventual DB sync
      await redisSAdd('videos:dirty', videoId);

      // Set 24-hour expiry for this set if not already set
      // (so user can count as new viewer after 24h)
      await redisExpire(userViewedKey, 24 * 60 * 60); // seconds
    }

    // Always update or create the View document for watch history
    await View.findOneAndUpdate(
      { video: videoId, user: userId },
      { $inc: { watchTime: 1 } }, // Example: increment watch time
      { upsert: true, new: true }
    );
  } else {
    // fallback to MongoDB (not recommended for high traffic)
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

  if (isRedisEnabled) await redisSet(cacheKey, videos, 300);

  res.status(200).json(new ApiResponse(200, videos, 'Search results fetched.'));
});

// TOGGLE PUBLISH STATUS
const togglePublishStatus = asyncHandler(async (req, res) => {
  const video = await getVideoOrFail(req.params.videoId);
  video.isPublished = !video.isPublished;
  await video.save();

  if (isRedisEnabled) {
    await redisDel(`video:${video._id}`);
    await redisDel(`user:${video.owner.toString()}:videos`);
    if (video.isPublished)
      await redisSAdd('videos:popular', video._id.toString());
    else await redisSRem('videos:popular', video._id.toString());
  }

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video publish status toggled.'));
});

// STREAM VIDEO (adaptive URLs)
const streamVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getVideoOrFail(videoId);

  let adaptiveStreams = [];

  if (Array.isArray(video.videoFile.eager)) {
    // Handle old format: array of objects where each object has 'secure_url'
    adaptiveStreams = video.videoFile.eager.map((v) => ({
      url: v.secure_url, // Old format used secure_url directly
      width: v.width,
      height: v.height,
      quality: v.label,
    }));
  } else if (
    typeof video.videoFile.eager === 'object' &&
    video.videoFile.eager !== null
  ) {
    // Handle new format: object mapping resolution labels to variant data, where each variant has 'playlistUrl'
    adaptiveStreams = Object.values(video.videoFile.eager).map((v) => ({
      url: v.playlistUrl, // New format uses playlistUrl
      width: v.width,
      height: v.height,
      quality: v.label,
    }));
  }

  if (!adaptiveStreams.length)
    return res.status(200).json({
      success: true,
      data: { url: video.videoFile.url },
      message: 'Video URL fetched, adaptive streams pending',
    });

  res.status(200).json({
    success: true,
    data: { streams: adaptiveStreams },
    message: 'Adaptive video streams fetched successfully',
  });
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
