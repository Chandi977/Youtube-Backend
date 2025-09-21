import mongoose, { isValidObjectId } from 'mongoose';
import { Tweet } from '../models/tweet.model.js';
import { User } from '../models/user.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  redisGet,
  redisSet,
  redisDel,
  isRedisEnabled,
} from '../utils/upstash.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../utils/cloudinary.js';

// -------------------- CREATE TWEET OR REPLY --------------------
const createTweet = asyncHandler(async (req, res) => {
  const { content, parentTweetId } = req.body;
  const owner = req.user.id;

  if (!content?.trim() && !req.file)
    throw new ApiError(400, 'Tweet must have text or image');

  let parentTweet = null;
  if (parentTweetId) {
    if (!isValidObjectId(parentTweetId))
      throw new ApiError(400, 'Invalid parent tweet ID');
    parentTweet = await Tweet.findById(parentTweetId);
    if (!parentTweet) throw new ApiError(404, 'Parent tweet not found');
  }

  let imageUrl = null;
  if (req.file) {
    const uploaded = await uploadOnCloudinary(req.file.path, 'image');
    imageUrl = uploaded.secure_url;
  }

  const newTweet = await Tweet.create({
    content,
    image: imageUrl,
    owner,
    parentTweet: parentTweetId || null,
  });

  if (isRedisEnabled) {
    await redisDel(`user:${owner}:tweets`);
    if (parentTweetId) await redisDel(`tweet:${parentTweetId}:replies`);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, newTweet, 'Tweet created successfully'));
});

// -------------------- GET USER TWEETS --------------------
const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  if (isRedisEnabled) {
    const cached = await redisGet(`user:${userId}:tweets`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Fetched from cache'));
  }

  const tweets = await Tweet.find({ owner: userId, parentTweet: null })
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  if (isRedisEnabled) await redisSet(`user:${userId}:tweets`, tweets);

  return res
    .status(200)
    .json(new ApiResponse(200, tweets, 'Tweets fetched successfully'));
});

// -------------------- GET TWEET REPLIES --------------------
const getTweetReplies = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  if (isRedisEnabled) {
    const cached = await redisGet(`tweet:${tweetId}:replies`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Fetched from cache'));
  }

  const replies = await Tweet.find({ parentTweet: tweetId })
    .populate('owner', 'username avatar')
    .sort({ createdAt: 1 });

  if (isRedisEnabled) await redisSet(`tweet:${tweetId}:replies`, replies);

  return res
    .status(200)
    .json(new ApiResponse(200, replies, 'Replies fetched successfully'));
});

// -------------------- LIKE / UNLIKE TWEET --------------------
const toggleLikeTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  const likedIndex = tweet.likes.indexOf(userId);
  let message = '';
  if (likedIndex === -1) {
    tweet.likes.push(userId);
    message = 'Tweet liked';
  } else {
    tweet.likes.splice(likedIndex, 1);
    message = 'Tweet unliked';
  }

  await tweet.save();

  // Cache update
  if (isRedisEnabled) await redisSet(`tweet:${tweetId}`, tweet);

  return res.status(200).json(new ApiResponse(200, tweet, message));
});

// -------------------- UPDATE TWEET --------------------

const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId, content } = req.body;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  if (tweet.owner.toString() !== userId)
    throw new ApiError(403, 'You cannot edit this tweet');

  // Update content
  if (content?.trim()) tweet.content = content.trim();

  // Update image if new file uploaded
  if (req.file) {
    // Delete old image from Cloudinary
    if (tweet.image) {
      const publicId = tweet.image.split('/').slice(-1)[0].split('.')[0];
      await deleteFromCloudinary(publicId, 'image');
    }

    const uploaded = await uploadOnCloudinary(req.file.path, 'image');
    tweet.image = uploaded.secure_url;
  }

  await tweet.save({ validateBeforeSave: false });

  if (isRedisEnabled) await redisSet(`tweet:${tweetId}`, tweet);

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, 'Tweet updated successfully'));
});

// -------------------- DELETE TWEET --------------------
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.body;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');
  if (tweet.owner.toString() !== userId)
    throw new ApiError(403, 'Cannot delete this tweet');

  // Delete image from Cloudinary if exists
  if (tweet.image) {
    const publicId = tweet.image.split('/').slice(-1)[0].split('.')[0];
    await deleteFromCloudinary(publicId, 'image');
  }

  await Tweet.deleteOne({ _id: tweetId });

  // Cache invalidation
  if (isRedisEnabled) {
    await redisDel(`tweet:${tweetId}`);
    await redisDel(`user:${userId}:tweets`);
    if (tweet.parentTweet) await redisDel(`tweet:${tweet.parentTweet}:replies`);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Tweet deleted successfully'));
});

// -------------------- SHARE / UNSHARE TWEET --------------------
const toggleShareTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  const sharedIndex = tweet.shares.indexOf(userId);
  let message = '';
  if (sharedIndex === -1) {
    tweet.shares.push(userId);
    message = 'Tweet shared';
  } else {
    tweet.shares.splice(sharedIndex, 1);
    message = 'Share removed';
  }

  await tweet.save();

  if (isRedisEnabled) await redisSet(`tweet:${tweetId}`, tweet);

  return res.status(200).json(new ApiResponse(200, tweet, message));
});

export {
  createTweet,
  getUserTweets,
  getTweetReplies,
  toggleLikeTweet,
  updateTweet,
  deleteTweet,
  toggleShareTweet,
};
