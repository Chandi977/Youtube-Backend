import mongoose, { isValidObjectId } from 'mongoose';
import { Tweet } from '../models/tweet.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const createTweet = asyncHandler(async (req, res) => {
  //TODO: create tweet
  try {
    const { content, owner } = req.body;

    if (!isValidObjectId(owner)) {
      throw new ApiError(400, 'Invalid owner ID');
    }

    const user = await User.findById(owner);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const newTweet = await Tweet.create({
      content,
      owner,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, newTweet, 'Tweet created successfully'));
  } catch (error) {
    console.error('Something went wrong when creating :', error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          error.message,
          'Something went wrong while creating tweet'
        )
      );
  }
});

const getUserTweets = asyncHandler(async (req, res) => {
  // TODO: get user tweets
  try {
    const userId = req.params.userId;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID',
      });
    }

    // Find tweets by the specified user ID
    const tweets = await Tweet.find({ owner: userId }).populate(
      'owner',
      'username'
    );

    res.status(200).json(new ApiResponse(200, tweets, 'Tweets retrieved:'));
  } catch (error) {
    console.error('Error while retrieving tweets:', error);
    res.status(500).json(new ApiResponse(500, {}, 'Internal Server Error'));
  }
});

const updateTweet = asyncHandler(async (req, res) => {
  //TODO: update tweet
});

const deleteTweet = asyncHandler(async (req, res) => {
  //TODO: delete tweet
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
