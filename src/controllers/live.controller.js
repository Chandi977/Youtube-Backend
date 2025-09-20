import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { LiveStream } from '../models/liveStream.model.js';
import { LiveComment } from '../models/liveComment.model.js';
import { StreamViewer } from '../models/liveViews.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';

// Create a new live stream
const createLiveStream = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category,
    tags,
    isPublished,
    chatEnabled,
    scheduledFor,
  } = req.body;
  const userId = req.user._id;

  if (!title?.trim()) {
    throw new ApiError(400, 'Title is required');
  }

  if (!description?.trim()) {
    throw new ApiError(400, 'Description is required');
  }

  if (!category) {
    throw new ApiError(400, 'Category is required');
  }

  // Upload thumbnail
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;
  if (!thumbnailLocalPath) {
    throw new ApiError(400, 'Thumbnail file is required');
  }

  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  if (!thumbnail) {
    throw new ApiError(400, 'Failed to upload thumbnail');
  }

  // Generate unique stream key
  const streamKey = `${userId}_${uuidv4()}`;

  const liveStream = await LiveStream.create({
    streamKey,
    title: title.trim(),
    description: description.trim(),
    thumbnail: thumbnail.url,
    owner: userId,
    category,
    tags: tags ? tags.split(',').map((tag) => tag.trim()) : [],
    isPublished: isPublished !== undefined ? isPublished : true,
    chatEnabled: chatEnabled !== undefined ? chatEnabled : true,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
  });

  const createdStream = await LiveStream.findById(liveStream._id).populate(
    'owner',
    'username fullName avatar'
  );

  return res
    .status(201)
    .json(
      new ApiResponse(201, createdStream, 'Live stream created successfully')
    );
});

// Start live stream
const startLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.owner.equals(userId)) {
    throw new ApiError(403, "You don't have permission to start this stream");
  }

  if (liveStream.isLive) {
    throw new ApiError(400, 'Stream is already live');
  }

  await liveStream.startStream();

  // Emit to all connected clients
  req.io.emit('streamStarted', {
    streamId: liveStream._id,
    title: liveStream.title,
    owner: liveStream.owner,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, liveStream, 'Live stream started successfully'));
});

// End live stream
const endLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.owner.equals(userId)) {
    throw new ApiError(403, "You don't have permission to end this stream");
  }

  if (!liveStream.isLive) {
    throw new ApiError(400, 'Stream is not currently live');
  }

  await liveStream.endStream();

  // End all active viewer sessions
  await StreamViewer.updateMany(
    { liveStream: streamId, isActive: true },
    {
      leftAt: new Date(),
      isActive: false,
    }
  );

  // Emit to all connected clients
  req.io.emit('streamEnded', {
    streamId: liveStream._id,
    title: liveStream.title,
    duration: liveStream.duration,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, liveStream, 'Live stream ended successfully'));
});

// Get all live streams
const getLiveStreams = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    sortBy = 'createdAt',
    sortType = 'desc',
    search,
  } = req.query;

  const pipeline = [];

  // Match conditions
  const matchConditions = { isLive: true, isPublished: true };

  if (category && category !== 'all') {
    matchConditions.category = category;
  }

  if (search) {
    matchConditions.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } },
    ];
  }

  pipeline.push({ $match: matchConditions });

  // Lookup owner details
  pipeline.push({
    $lookup: {
      from: 'users',
      localField: 'owner',
      foreignField: '_id',
      as: 'owner',
      pipeline: [
        {
          $project: {
            username: 1,
            fullName: 1,
            avatar: 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $addFields: {
      owner: { $first: '$owner' },
    },
  });

  // Sort
  const sortStage = {};
  sortStage[sortBy] = sortType === 'desc' ? -1 : 1;
  pipeline.push({ $sort: sortStage });

  // Pagination
  const skip = (page - 1) * limit;
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: parseInt(limit) });

  const liveStreams = await LiveStream.aggregate(pipeline);

  const totalStreams = await LiveStream.countDocuments(matchConditions);
  const totalPages = Math.ceil(totalStreams / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        streams: liveStreams,
        currentPage: parseInt(page),
        totalPages,
        totalStreams,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      'Live streams fetched successfully'
    )
  );
});

// Get single live stream
const getLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;

  const liveStream = await LiveStream.findById(streamId)
    .populate('owner', 'username fullName avatar')
    .populate('moderators', 'username fullName avatar');

  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  // Get viewer count
  const viewerCount = await StreamViewer.getViewerCount(streamId);

  const streamData = {
    ...liveStream.toObject(),
    currentViewers: viewerCount,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, streamData, 'Live stream fetched successfully'));
});

// Join live stream (for viewers)
const joinLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;
  const { socketId, device = 'desktop', quality = '720p' } = req.body;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.isLive) {
    throw new ApiError(400, 'Stream is not currently live');
  }

  // Check if user is already viewing
  const existingViewer = await StreamViewer.findOne({
    liveStream: streamId,
    user: userId,
    isActive: true,
  });

  if (existingViewer) {
    // Update existing viewer session
    existingViewer.socketId = socketId;
    existingViewer.device = device;
    existingViewer.quality = quality;
    existingViewer.lastSeen = new Date();
    await existingViewer.save();
  } else {
    // Create new viewer session
    await StreamViewer.create({
      liveStream: streamId,
      user: userId,
      socketId,
      device,
      quality,
    });

    // Increment concurrent viewers
    await liveStream.addViewer();
  }

  // Emit viewer joined event
  req.io.to(streamId).emit('viewerJoined', {
    streamId,
    viewerId: userId,
    concurrentViewers: liveStream.concurrentViewers + 1,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Joined live stream successfully'));
});

// Leave live stream
const leaveLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;

  const viewer = await StreamViewer.findOne({
    liveStream: streamId,
    user: userId,
    isActive: true,
  });

  if (viewer) {
    await viewer.leave();

    // Decrement concurrent viewers
    const liveStream = await LiveStream.findById(streamId);
    if (liveStream) {
      await liveStream.removeViewer();
    }

    // Emit viewer left event
    req.io.to(streamId).emit('viewerLeft', {
      streamId,
      viewerId: userId,
      concurrentViewers: liveStream ? liveStream.concurrentViewers - 1 : 0,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Left live stream successfully'));
});

// Get stream analytics (owner only)
const getStreamAnalytics = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.owner.equals(userId)) {
    throw new ApiError(403, "You don't have permission to view analytics");
  }

  // Get viewer statistics
  const viewerStats = await StreamViewer.getViewerStats(streamId);

  // Get comment statistics
  const commentStats = await LiveComment.aggregate([
    { $match: { liveStream: mongoose.Types.ObjectId(streamId) } },
    {
      $group: {
        _id: null,
        totalComments: { $sum: 1 },
        totalLikes: { $sum: '$likesCount' },
        superChats: {
          $sum: {
            $cond: [{ $eq: ['$type', 'superchat'] }, '$superChatAmount', 0],
          },
        },
      },
    },
  ]);

  const analytics = {
    stream: liveStream,
    viewers: viewerStats[0] || {},
    comments: commentStats[0] || {
      totalComments: 0,
      totalLikes: 0,
      superChats: 0,
    },
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, analytics, 'Stream analytics fetched successfully')
    );
});

// Update stream settings
const updateStreamSettings = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;
  const updates = req.body;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.owner.equals(userId)) {
    throw new ApiError(403, "You don't have permission to update this stream");
  }

  // Update allowed fields
  const allowedUpdates = [
    'title',
    'description',
    'category',
    'tags',
    'chatEnabled',
    'streamSettings',
    'monetization',
  ];

  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      liveStream[key] = updates[key];
    }
  });

  await liveStream.save();

  return res
    .status(200)
    .json(
      new ApiResponse(200, liveStream, 'Stream settings updated successfully')
    );
});

// Delete live stream
const deleteLiveStream = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const userId = req.user._id;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.owner.equals(userId)) {
    throw new ApiError(403, "You don't have permission to delete this stream");
  }

  if (liveStream.isLive) {
    throw new ApiError(400, 'Cannot delete an active live stream');
  }

  // Delete associated data
  await Promise.all([
    LiveComment.deleteMany({ liveStream: streamId }),
    StreamViewer.deleteMany({ liveStream: streamId }),
    LiveStream.findByIdAndDelete(streamId),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Live stream deleted successfully'));
});

export {
  createLiveStream,
  startLiveStream,
  endLiveStream,
  getLiveStreams,
  getLiveStream,
  joinLiveStream,
  leaveLiveStream,
  getStreamAnalytics,
  updateStreamSettings,
  deleteLiveStream,
};
