import mongoose, { isValidObjectId } from 'mongoose';
import { Tweet } from '../models/tweet.model.js';
import { User } from '../models/user.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { redisGet, redisSet, isRedisEnabled } from '../utils/upstash.js';

/**
 * CREATE TWEET OR REPLY
 * If parentTweetId is provided, this tweet is a reply.
 */
const createTweet = asyncHandler(async (req, res) => {
  const { content, parentTweetId } = req.body;
  const owner = req.user.id;

  if (!content?.trim()) throw new ApiError(400, 'Content cannot be empty');

  // Check if parent tweet exists
  let parentTweet = null;
  if (parentTweetId) {
    if (!isValidObjectId(parentTweetId))
      throw new ApiError(400, 'Invalid parent tweet ID');
    parentTweet = await Tweet.findById(parentTweetId);
    if (!parentTweet) throw new ApiError(404, 'Parent tweet not found');
  }

  const newTweet = await Tweet.create({
    content,
    owner,
    parentTweet: parentTweetId || null,
  });

  // Invalidate cache
  if (isRedisEnabled) {
    await redisSet(`user:${owner}:tweets`, null);
    if (parentTweetId) await redisSet(`tweet:${parentTweetId}:replies`, null);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, newTweet, 'Tweet created successfully'));
});

/**
 * GET USER TWEETS
 * Includes original tweets + replies
 */
const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  // Redis cache check
  if (isRedisEnabled) {
    const cached = await redisGet(`user:${userId}:tweets`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, JSON.parse(cached), 'Fetched from cache'));
  }

  const tweets = await Tweet.find({ owner: userId, parentTweet: null })
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  // Cache
  if (isRedisEnabled)
    await redisSet(`user:${userId}:tweets`, JSON.stringify(tweets));

  return res
    .status(200)
    .json(new ApiResponse(200, tweets, 'Tweets fetched successfully'));
});

/**
 * GET REPLIES OF A TWEET
 */
const getTweetReplies = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  // Redis cache
  if (isRedisEnabled) {
    const cached = await redisGet(`tweet:${tweetId}:replies`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, JSON.parse(cached), 'Fetched from cache'));
  }

  const replies = await Tweet.find({ parentTweet: tweetId })
    .populate('owner', 'username avatar')
    .sort({ createdAt: 1 }); // oldest first

  // Cache
  if (isRedisEnabled)
    await redisSet(`tweet:${tweetId}:replies`, JSON.stringify(replies));

  return res
    .status(200)
    .json(new ApiResponse(200, replies, 'Replies fetched successfully'));
});

/**
 * LIKE / UNLIKE TWEET
 */
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

  // Cache invalidate
  if (isRedisEnabled) await redisSet(`tweet:${tweetId}`, JSON.stringify(tweet));

  return res.status(200).json(new ApiResponse(200, tweet, message));
});

/**
 * UPDATE TWEET
 */
const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId, content } = req.body;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  // Check ownership
  if (tweet.owner.toString() !== userId)
    throw new ApiError(403, 'You cannot edit this tweet');

  // Update content only if provided
  if (content?.trim()) tweet.content = content.trim();

  await tweet.save({ validateBeforeSave: false });

  // Redis cache update
  if (isRedisEnabled) await redisSet(`tweet:${tweetId}`, JSON.stringify(tweet));

  return res
    .status(200)
    .json(new ApiResponse(200, tweet, 'Tweet updated successfully'));
});

/**
 * DELETE TWEET
 */
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.body;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');
  if (tweet.owner.toString() !== userId)
    throw new ApiError(403, 'Cannot delete this tweet');

  await Tweet.deleteOne({ _id: tweetId });

  // Invalidate cache
  if (isRedisEnabled) {
    await redisSet(`tweet:${tweetId}`, null);
    await redisSet(`user:${userId}:tweets`, null);
    if (tweet.parentTweet)
      await redisSet(`tweet:${tweet.parentTweet}:replies`, null);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Tweet deleted successfully'));
});

export {
  createTweet,
  getUserTweets,
  getTweetReplies,
  toggleLikeTweet,
  updateTweet,
  deleteTweet,
};
