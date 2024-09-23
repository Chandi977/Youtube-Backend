import mongoose, { isValidObjectId } from 'mongoose';
import { Like } from '../models/like.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Function to toggle like on a video
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  try {
    const userId = req.user.id;

    // Pehle check karo ke video exist karti hai ya nahi
    const video = await Video.findById(videoId);

    if (!video) {
      throw new ApiError(404, 'Video not found');
    }

    // Check if user has already liked the video
    const like = await Like.findOne({ video: videoId, likedBy: userId });

    // Agar like mila toh dislike kar do
    if (like) {
      await like.remove();
      return res
        .status(200)
        .json(new ApiResponse(200, {}, 'Disliked the video.'));
    }
    // Agar like nahi mila toh like kar do
    else {
      await Like.create({
        video: videoId,
        likedBy: userId,
      });

      return res
        .status(201)
        .json(new ApiResponse(201, {}, 'Liked video successfully.'));
    }
  } catch (error) {
    console.error('Error toggling like on video:', error);
    return res.status(500).json(new ApiError(500, 'Internal Server Error'));
  }
});

// Function to toggle like on a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  try {
    const userId = req.user.id;

    // Pehle check karo ke comment exist karti hai ya nahi
    const comment = await Comment.findById(commentId);

    if (!comment) {
      throw new ApiError(404, 'Comment not found');
    }

    // Check if user has already liked the comment
    const like = await Like.findOne({ comment: commentId, likedBy: userId });

    // Agar like mila toh dislike kar do
    if (like) {
      await like.remove();
      return res
        .status(200)
        .json(new ApiResponse(200, {}, 'Disliked the comment.'));
    }
    // Agar like nahi mila toh like kar do
    else {
      await Like.create({
        comment: commentId,
        likedBy: userId,
      });

      return res
        .status(201)
        .json(new ApiResponse(201, {}, 'Liked comment successfully.'));
    }
  } catch (error) {
    console.error('Error toggling like on comment:', error);
    return res.status(500).json(new ApiError(500, 'Internal Server Error'));
  }
});

// Function to toggle like on a tweet
const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  try {
    const userId = req.user.id;

    // Pehle check karo ke tweet exist karti hai ya nahi
    const tweet = await Tweet.findById(tweetId);

    if (!tweet) {
      throw new ApiError(404, 'Tweet not found');
    }

    // Check if user has already liked the tweet
    const like = await Like.findOne({ tweet: tweetId, likedBy: userId });

    // Agar like mila toh dislike kar do
    if (like) {
      await like.remove();
      return res
        .status(200)
        .json(new ApiResponse(200, {}, 'Disliked the tweet.'));
    }
    // Agar like nahi mila toh like kar do
    else {
      await Like.create({
        tweet: tweetId,
        likedBy: userId,
      });

      return res
        .status(201)
        .json(new ApiResponse(201, {}, 'Liked tweet successfully.'));
    }
  } catch (error) {
    console.error('Error toggling like on tweet:', error);
    return res.status(500).json(new ApiError(500, 'Internal Server Error'));
  }
});

// Function to get all liked videos of a user
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    // Sare liked videos retrieve karo jo user ne like kiye hai
    const likedVideos = await Like.find({
      video: { $ne: null },
      likedBy: userId,
    }).populate('video', '_id title description owner views');

    return res
      .status(200)
      .json(new ApiResponse(200, likedVideos, 'Liked videos retrieved.'));
  } catch (error) {
    console.error('Error retrieving liked videos:', error);
    return res.status(500).json(new ApiError(500, 'Internal Server Error'));
  }
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
