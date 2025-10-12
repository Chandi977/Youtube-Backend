import mongoose, { isValidObjectId } from 'mongoose';
import fs from 'fs';
import { Tweet } from '../models/tweet.model.js';
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

  if (!content?.trim() && !req.file) {
    throw new ApiError(400, 'Tweet must have text or image');
  }

  if (parentTweetId && !isValidObjectId(parentTweetId)) {
    throw new ApiError(400, 'Invalid parent tweet ID');
  }

  let imageData;

  try {
    if (req.file) {
      const uploaded = await uploadOnCloudinary(req.file.path, 'image');
      if (!uploaded?.secure_url || !uploaded?.public_id) {
        throw new ApiError(500, 'Failed to upload image to Cloudinary');
      }
      imageData = {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      };
    }

    const newTweet = await Tweet.create({
      content: content?.trim() || '',
      image: imageData,
      owner,
      parentTweet: parentTweetId || null,
    });

    if (isRedisEnabled) {
      await redisDel(`user:${owner}:tweets`);
      if (parentTweetId) await redisDel(`tweet:${parentTweetId}:repliesTree`);
    }

    res
      .status(201)
      .json(new ApiResponse(201, newTweet, 'Tweet created successfully'));
  } catch (err) {
    console.error('Tweet creation failed:', err);
    if (imageData?.publicId) {
      await deleteFromCloudinary(imageData.publicId, 'image').catch(() => {});
    }
    throw err;
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, (e) => e && console.warn(e));
    }
  }
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

// -------------------- GET TWEET REPLIES (Nested) --------------------
const getTweetReplies = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  if (isRedisEnabled) {
    const cached = await redisGet(`tweet:${tweetId}:repliesTree`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Fetched from cache'));
  }

  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(tweetId) } },
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'owner',
      },
    },
    { $unwind: '$owner' },
    {
      $graphLookup: {
        from: 'tweets',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parentTweet',
        as: 'allReplies',
        depthField: 'level',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'allReplies.owner',
        foreignField: '_id',
        as: 'replyUsers',
      },
    },
    {
      $addFields: {
        replies: {
          $map: {
            input: '$allReplies',
            as: 'r',
            in: {
              _id: '$$r._id',
              content: '$$r.content',
              image: '$$r.image',
              parentTweet: '$$r.parentTweet',
              createdAt: '$$r.createdAt',
              owner: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$replyUsers',
                      cond: { $eq: ['$$this._id', '$$r.owner'] },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    },
  ];

  const [tweetData] = await Tweet.aggregate(pipeline);
  if (!tweetData) throw new ApiError(404, 'Tweet not found');

  const buildTree = (allReplies, parentId = tweetId) =>
    allReplies
      .filter((r) => r.parentTweet?.toString() === parentId.toString())
      .map((r) => ({ ...r, replies: buildTree(allReplies, r._id) }));

  const tweetWithRepliesTree = {
    _id: tweetData._id,
    content: tweetData.content,
    image: tweetData.image,
    owner: tweetData.owner,
    createdAt: tweetData.createdAt,
    replies: buildTree(tweetData.replies),
  };

  if (isRedisEnabled)
    await redisSet(`tweet:${tweetId}:repliesTree`, tweetWithRepliesTree);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        tweetWithRepliesTree,
        'Tweet and replies fetched successfully'
      )
    );
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

  if (content?.trim()) tweet.content = content.trim();

  if (req.file) {
    if (tweet.image?.publicId)
      await deleteFromCloudinary(tweet.image.publicId, 'image');
    const uploaded = await uploadOnCloudinary(req.file.path, 'image');
    tweet.image = { url: uploaded.secure_url, publicId: uploaded.public_id };
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

  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(tweetId) } },
    {
      $graphLookup: {
        from: 'tweets',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parentTweet',
        as: 'allReplies',
      },
    },
    {
      $project: {
        idsToDelete: { $concatArrays: [['$_id'], '$allReplies._id'] },
      },
    },
  ];

  const [result] = await Tweet.aggregate(pipeline);
  if (!result?.idsToDelete.length) throw new ApiError(404, 'Tweet not found');

  const tweetsToDelete = await Tweet.find({ _id: { $in: result.idsToDelete } });

  for (const t of tweetsToDelete) {
    if (t.image?.publicId)
      await deleteFromCloudinary(t.image.publicId, 'image');
  }

  await Tweet.deleteMany({ _id: { $in: result.idsToDelete } });

  if (isRedisEnabled) {
    await redisDel(`tweet:${tweetId}`);
    await redisDel(`user:${userId}:tweets`);
    if (tweet.parentTweet)
      await redisDel(`tweet:${tweet.parentTweet}:repliesTree`);
    for (const t of tweetsToDelete)
      await redisDel(`tweet:${t._id}:repliesTree`);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        'Tweet and all nested replies deleted successfully'
      )
    );
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
