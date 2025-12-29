import fs from 'fs';
import jwt from 'jsonwebtoken';
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
  const mergedQuery = { ...(req.query || {}), ...(req.filter || {}) };

  const {
    page = 1,
    limit = 10,
    query: searchQuery,
    sortBy = 'createdAt',
    sortType = 'desc',
    isPublished,
  } = mergedQuery;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  const videosVersion =
    (isRedisEnabled && (await redisGet('videos:version'))) || 1;
  const cacheKey = isRedisEnabled
    ? `videos:v${videosVersion}:all:${pageNum}:${limitNum}:${searchQuery || ''}:${sortBy}:${sortType}:${isPublished || ''}`
    : null;
  if (isRedisEnabled && cacheKey) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res.status(200).json({
        success: true,
        message: 'Videos fetched from cache',
        data: cached,
      });
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

  const formattedVideos = videos.map(formatVideo);
  const totalVideos = await Video.countDocuments(matchCriteria);

  const response = {
    videos: formattedVideos,
    total: totalVideos,
    page: pageNum,
    limit: limitNum,
  };

  if (isRedisEnabled && cacheKey) await redisSet(cacheKey, response, 300);

  res.status(200).json({
    success: true,
    message: videos.length
      ? 'Videos fetched successfully'
      : 'No videos found',
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

  if (!isRedisEnabled || !videoQueue) {
    throw new ApiError(
      503,
      'Video processing is temporarily unavailable. Please try again later.'
    );
  }

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

// 🎬 Controller: Get Video by ID
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const cacheKey = `video:${videoId}`;

  // 1️⃣ Try Redis cache first
  const cached = await redisGet(cacheKey);
  let userId = null;

  // ✅ Try getting token from either cookie or Authorization header
  const token =
    req.cookies?.accessToken ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  // Decode token safely (don't throw errors)
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      userId = decoded._id;
    } catch (err) {
      console.log('⚠️ Token invalid or expired, skipping watch history');
    }
  }

  // 2️⃣ If cached version found
  if (cached) {
    console.log('⚡ Served from Redis cache');

    // Add to watch history only for valid users
    if (userId) {
      await addToWatchHistory(userId, videoId);
      console.log('✅ Watch history updated (from cache)');
    }

    return res.status(200).json({ success: true, data: cached });
  }

  // 3️⃣ Fetch from MongoDB if not cached
  const video = await Video.findById(videoId).populate(
    'owner',
    'fullName username avatar'
  );

  if (!video) throw new ApiError(404, 'Video not found');

  const videoData = video.toObject();

  // 4️⃣ Cache the fresh video
  if (isRedisEnabled) await redisSet(cacheKey, videoData, 600);
  console.log('🧠 Video cached in Redis:', videoId);

  // 5️⃣ Add to watch history for authenticated users
  if (userId) {
    await addToWatchHistory(userId, videoId);
    console.log('✅ Watch history updated (from DB)');
  }

  // 6️⃣ Send Response
  res.status(200).json({ success: true, data: videoData });
});
// ====================== Helper Function ======================

// Limit how many videos are stored in history
const HISTORY_LIMIT = 50;

// 🧩 Helper Function: Add to Watch History
const addToWatchHistory = async (userId, videoId) => {
  console.log('➡️ Entering addToWatchHistory');

  try {
    if (!userId || !videoId) return;

    const user = await User.findById(userId).select('watchHistory');
    if (!user) return;

    // 🔍 Check if video already exists
    const existingIndex = user.watchHistory.findIndex(
      (id) => id.toString() === videoId.toString()
    );

    // 🧹 Remove old entry if exists
    if (existingIndex > -1) {
      user.watchHistory.splice(existingIndex, 1);
    }

    // ⏫ Add new video at start
    user.watchHistory.unshift(videoId);

    // 📉 Limit history to 50
    if (user.watchHistory.length > HISTORY_LIMIT) {
      user.watchHistory = user.watchHistory.slice(0, HISTORY_LIMIT);
    }

    await user.save();
    console.log('✅ Watch history updated:', user.watchHistory.length, 'items');

    // 🔄 Update Redis cache (optional)
    if (isRedisEnabled) {
      const cacheKey = `watchHistory:${userId}`;
      const updatedHistory = await User.findById(userId)
        .populate({
          path: 'watchHistory',
          select: 'title thumbnail duration owner',
          populate: { path: 'owner', select: 'fullName username avatar' },
        })
        .select('watchHistory');

      await redisSet(cacheKey, updatedHistory.watchHistory, 600); // Cache for 10 min
      console.log('🧠 Redis cache updated for watch history');
    }
  } catch (err) {
    console.error('❌ Error adding to watch history:', err);
  }
};

const getWatchHistory = asyncHandler(async (req, res) => {
  const userId = req.user?._id; // Assuming authentication middleware sets req.user

  if (!userId) throw new ApiError(401, 'User not authenticated');

  const cacheKey = `watchHistory:${userId}`;

  // ✅ 1. Try fetching from Redis
  if (isRedisEnabled) {
    const cachedHistory = await redisGet(cacheKey);
    if (cachedHistory) {
      return res.status(200).json({
        success: true,
        source: 'cache',
        data: cachedHistory,
      });
    }
  }

  // ✅ 2. Fetch from MongoDB
  const user = await User.findById(userId)
    .populate({
      path: 'watchHistory',
      select: 'title thumbnail duration views createdAt owner',
      populate: {
        path: 'owner',
        select: 'fullName username avatar',
      },
    })
    .select('watchHistory');

  if (!user) throw new ApiError(404, 'User not found');

  const watchHistory = user.watchHistory || [];

  // ✅ 3. Cache result in Redis for faster future loads
  if (isRedisEnabled) {
    await redisSet(cacheKey, watchHistory, 600); // Cache for 10 minutes
  }

  // ✅ 4. Return the response
  res.status(200).json({
    success: true,
    count: watchHistory.length,
    source: 'database',
    data: watchHistory,
  });
});

// GET VIDEOS BY USER
const getVideosByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  const cacheKey = `user:${userId}:videos`;
  const cached = await redisGet(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const videos = await Video.find({ owner: userId })
    .select('_id title thumbnail likesCount viewsCount createdAt') // <-- owner not included
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

  // dY-`�,? Delete from Cloudinary
  if (video.videoFile?.public_id)
    await deleteFromCloudinary(video.videoFile.public_id, 'video');
  if (video.thumbnail?.public_id)
    await deleteFromCloudinary(video.thumbnail.public_id, 'image');

  // dY1 Delete from MongoDB
  await video.deleteOne();

  // dY� Redis cleanup
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
  const userKey =
    req.user?._id?.toString() ||
    req.ip || // fallback to IP for guests
    'anonymous';

  await getVideoOrFail(videoId);

  if (isRedisEnabled) {
    const userViewedKey = `video:${videoId}:viewed`;

    // Add user/IP to set
    const added = await redisSAdd(userViewedKey, userKey);

    if (added) {
      // Increment views (Redis)
      await redisIncr(`video:${videoId}:views`);

      // Mark video as dirty for eventual DB sync
      await redisSAdd('videos:dirty', videoId);

      // Also persist the view count for immediate consistency in API responses
      await Video.findByIdAndUpdate(videoId, { $inc: { viewsCount: 1 } });

      // Set 24-hour expiry so the same user/IP counts again after 24h
      await redisExpire(userViewedKey, 24 * 60 * 60);

      // Bust caches so views update in responses
      await redisDel(`video:${videoId}`);
      await redisIncr('videos:version');
    }

    // Only track watch history for authenticated users
    if (req.user?._id) {
      await View.findOneAndUpdate(
        { video: videoId, user: req.user._id },
        { $inc: { watchTime: 1 } },
        { upsert: true, new: true }
      );
    }
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
  getWatchHistory,
};
