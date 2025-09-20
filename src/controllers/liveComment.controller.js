import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { LiveComment } from '../models/liveComment.model.js';
import { LiveStream } from '../models/liveStream.model.js';
import { StreamViewer } from '../models/liveViews.model.js';
import mongoose from 'mongoose';

// Add comment to live stream
const addLiveComment = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const { content, type = 'regular', superChatAmount = 0 } = req.body;
  const userId = req.user._id;

  if (!content?.trim()) {
    throw new ApiError(400, 'Comment content is required');
  }

  // Check if stream exists and is live
  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  if (!liveStream.isLive) {
    throw new ApiError(400, 'Stream is not currently live');
  }

  if (!liveStream.chatEnabled) {
    throw new ApiError(400, 'Chat is disabled for this stream');
  }

  // Check if user is viewing the stream OR is the stream owner
  const isOwner = liveStream.owner.equals(userId);

  const viewer = await StreamViewer.findOne({
    liveStream: streamId,
    user: userId,
    isActive: true,
  });

  if (!viewer && !isOwner) {
    throw new ApiError(400, 'You must be watching the stream to comment');
  }

  // Check if user is banned (even owner can’t be banned)
  const isBanned = liveStream.bannedUsers.some((ban) =>
    ban.user.equals(userId)
  );
  if (isBanned) {
    throw new ApiError(403, 'You are banned from commenting on this stream');
  }

  // Calculate stream timestamp
  const streamTimestamp = liveStream.startTime
    ? Math.floor((new Date() - liveStream.startTime) / 1000)
    : 0;

  // Validate super chat
  if (type === 'superchat' && (!superChatAmount || superChatAmount <= 0)) {
    throw new ApiError(400, 'Super chat amount must be greater than 0');
  }

  const comment = await LiveComment.create({
    content: content.trim(),
    liveStream: streamId,
    owner: userId,
    type,
    superChatAmount: type === 'superchat' ? superChatAmount : 0,
    streamTimestamp,
    isHighlighted: type === 'superchat' || superChatAmount > 100,
  });

  // Populate owner details
  await comment.populate('owner', 'username fullName avatar');

  // Update stream stats
  await LiveStream.findByIdAndUpdate(streamId, {
    $inc: { 'streamStats.totalMessages': 1 },
  });

  // Update viewer engagement (skip if owner isn't a viewer)
  if (viewer) {
    await viewer.incrementEngagement('messagesCount');
    if (type === 'superchat') {
      await viewer.incrementEngagement('superChatsAmount', superChatAmount);
    }
  }

  // Emit real-time comment to all stream viewers
  req.io.to(streamId).emit('newComment', {
    comment: comment.toObject(),
    streamId,
    timestamp: new Date(),
  });

  // Special handling for super chats
  if (type === 'superchat') {
    req.io.to(streamId).emit('superChat', {
      comment: comment.toObject(),
      amount: superChatAmount,
      streamId,
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, comment, 'Comment added successfully'));
});

// Get live comments with real-time pagination
const getLiveComments = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const {
    page = 1,
    limit = 50,
    since,
    type = 'all',
    pinned = false,
  } = req.query;

  // Validate stream ID
  if (!mongoose.Types.ObjectId.isValid(streamId)) {
    throw new ApiError(400, 'Invalid stream ID');
  }

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  const matchConditions = {
    liveStream: new mongoose.Types.ObjectId(streamId),
    isDeleted: false,
  };

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      matchConditions.createdAt = { $gt: sinceDate };
    }
  }

  if (type !== 'all') {
    matchConditions.type = type;
  }

  if (pinned === 'true') {
    matchConditions.isPinned = true;
  }

  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'owner',
        pipeline: [{ $project: { username: 1, fullName: 1, avatar: 1 } }],
      },
    },
    { $addFields: { owner: { $first: '$owner' } } },
    { $sort: { isPinned: -1, createdAt: -1 } },
    { $skip: (page - 1) * parseInt(limit) },
    { $limit: parseInt(limit) },
  ];

  const comments = await LiveComment.aggregate(pipeline);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        comments,
        page: parseInt(page),
        hasMore: comments.length === parseInt(limit),
      },
      'Live comments fetched successfully'
    )
  );
});

// Like/Unlike a live comment
const toggleLiveCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id;

  const comment = await LiveComment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  if (comment.isDeleted) {
    throw new ApiError(400, 'Cannot like a deleted comment');
  }

  const isLiked = comment.likes.includes(userId);
  let updatedComment;

  if (isLiked) {
    // Unlike
    updatedComment = await comment.removeLike(userId);
  } else {
    // Like
    updatedComment = await comment.addLike(userId);

    // Update viewer engagement
    const viewer = await StreamViewer.findOne({
      liveStream: comment.liveStream,
      user: userId,
      isActive: true,
    });
    if (viewer) {
      await viewer.incrementEngagement('likesGiven');
    }
  }

  // Emit real-time like update
  req.io.to(comment.liveStream.toString()).emit('commentLikeUpdate', {
    commentId,
    likesCount: updatedComment.likesCount,
    isLiked: !isLiked,
    userId,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        liked: !isLiked,
        likesCount: updatedComment.likesCount,
      },
      isLiked ? 'Comment unliked' : 'Comment liked'
    )
  );
});

// Reply to a live comment
const replyToLiveComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  const userId = req.user._id;

  if (!content?.trim()) {
    throw new ApiError(400, 'Reply content is required');
  }

  const comment = await LiveComment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  if (comment.isDeleted) {
    throw new ApiError(400, 'Cannot reply to a deleted comment');
  }

  // Check if the stream is still live
  const liveStream = await LiveStream.findById(comment.liveStream);
  if (!liveStream?.isLive) {
    throw new ApiError(400, 'Cannot reply to comments on ended streams');
  }

  await comment.addReply(content.trim(), userId);
  await comment.populate('replies.owner', 'username fullName avatar');

  // Emit real-time reply
  req.io.to(comment.liveStream.toString()).emit('commentReply', {
    commentId,
    reply: comment.replies[comment.replies.length - 1],
    streamId: comment.liveStream,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        comment.replies[comment.replies.length - 1],
        'Reply added successfully'
      )
    );
});

// Pin/Unpin comment (moderators/owner only)
const toggleCommentPin = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id;

  const comment = await LiveComment.findById(commentId).populate('liveStream');
  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  const liveStream = comment.liveStream;

  // Check if user has permission (owner or moderator)
  const hasPermission =
    liveStream.owner.equals(userId) || liveStream.moderators.includes(userId);

  if (!hasPermission) {
    throw new ApiError(403, "You don't have permission to pin comments");
  }

  comment.isPinned = !comment.isPinned;
  await comment.save();

  // Emit real-time pin update
  req.io.to(liveStream._id.toString()).emit('commentPinUpdate', {
    commentId,
    isPinned: comment.isPinned,
    streamId: liveStream._id,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        commentId,
        isPinned: comment.isPinned,
      },
      comment.isPinned ? 'Comment pinned' : 'Comment unpinned'
    )
  );
});

// Delete comment (owner/moderator or comment author)
const deleteLiveComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id;

  const comment = await LiveComment.findById(commentId).populate('liveStream');
  if (!comment) {
    throw new ApiError(404, 'Comment not found');
  }

  const liveStream = comment.liveStream;

  // Check if user has permission
  const hasPermission =
    comment.owner.equals(userId) ||
    liveStream.owner.equals(userId) ||
    liveStream.moderators.includes(userId);

  if (!hasPermission) {
    throw new ApiError(403, "You don't have permission to delete this comment");
  }

  await comment.softDelete(userId);

  // Emit real-time deletion
  req.io.to(liveStream._id.toString()).emit('commentDeleted', {
    commentId,
    streamId: liveStream._id,
    deletedBy: userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Comment deleted successfully'));
});

// Get top/featured comments (super chats, most liked, etc.)
const getFeaturedComments = asyncHandler(async (req, res) => {
  const { streamId } = req.params;
  const { type = 'superchat', limit = 10 } = req.query;

  const liveStream = await LiveStream.findById(streamId);
  if (!liveStream) {
    throw new ApiError(404, 'Live stream not found');
  }

  let pipeline = [
    {
      $match: {
        liveStream: mongoose.Types.ObjectId(streamId),
        isDeleted: false,
      },
    },
  ];

  // Filter based on type
  if (type === 'superchat') {
    pipeline.push({ $match: { type: 'superchat' } });
    pipeline.push({ $sort: { superChatAmount: -1, createdAt: -1 } });
  } else if (type === 'mostliked') {
    pipeline.push({ $sort: { likesCount: -1, createdAt: -1 } });
  } else if (type === 'pinned') {
    pipeline.push({ $match: { isPinned: true } });
    pipeline.push({ $sort: { createdAt: -1 } });
  }

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

  pipeline.push({ $limit: parseInt(limit) });

  const featuredComments = await LiveComment.aggregate(pipeline);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        featuredComments,
        'Featured comments fetched successfully'
      )
    );
});

export {
  addLiveComment,
  getLiveComments,
  toggleLiveCommentLike,
  replyToLiveComment,
  toggleCommentPin,
  deleteLiveComment,
  getFeaturedComments,
};
