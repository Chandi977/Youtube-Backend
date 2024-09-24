import mongoose, { isValidObjectId } from 'mongoose';
import { Tweet } from '../models/tweet.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Tweet create karne ke liye controller
const createTweet = asyncHandler(async (req, res) => {
  try {
    const { content, owner } = req.body;

    // Owner ka ID check karo agar valid hai
    if (!isValidObjectId(owner)) {
      throw new ApiError(400, 'Invalid owner ID');
    }

    // User ko owner ID se find karo
    const user = await User.findById(owner);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Naya tweet create karo
    const newTweet = await Tweet.create({
      content,
      owner,
    });

    // Naya tweet response mein return karo
    return res
      .status(201)
      .json(new ApiResponse(201, newTweet, 'Tweet created successfully'));
  } catch (error) {
    console.error('Tweet create karte waqt error aaya:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          error.message,
          'Tweet create karte waqt kuch galat ho gaya'
        )
      );
  }
});

// Specific user ke sabhi tweets retrieve karne ke liye controller
const getUserTweets = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId;

    // User ID validate karo
    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID',
      });
    }

    // User ke sabhi tweets find karo
    const tweets = await Tweet.find({ owner: userId }).populate(
      'owner',
      'username'
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, tweets, 'Tweets successfully retrieve kiye gaye')
      );
  } catch (error) {
    console.error('Tweets retrieve karte waqt error:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, {}, 'Internal Server Error'));
  }
});

// Specific tweet update karne ke liye controller
const updateTweet = asyncHandler(async (req, res) => {
  try {
    const { tweetId, updateContent } = req.body;

    // Tweet ID validate karo
    if (!isValidObjectId(tweetId)) {
      throw new ApiError(400, 'Invalid tweet ID');
    }

    // Tweet ID se tweet find karo
    const tweet = await Tweet.findById(tweetId); // Bug fix: 'await' ka use kiya promise handle karne ke liye

    if (!tweet) {
      throw new ApiError(404, 'Tweet nahi mila');
    }

    // Tweet ka content update karo
    tweet.content = updateContent;
    await tweet.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResponse(200, tweet, 'Tweet successfully update kiya gaya'));
  } catch (error) {
    console.error('Tweet update karte waqt error:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, {}, 'Internal Server Error'));
  }
});

// Specific tweet delete karne ke liye controller
const deleteTweet = asyncHandler(async (req, res) => {
  try {
    const { tweetId } = req.body;
    const userId = req.user.id;

    // Tweet ID validate karo
    if (!isValidObjectId(tweetId)) {
      throw new ApiError(400, 'Invalid tweet ID');
    }

    // Tweet ko tweet ID se find karo
    const tweet = await Tweet.findById(tweetId);

    if (!tweet) {
      throw new ApiError(404, 'Tweet nahi mila');
    }

    // Check karo ki user ka tweet hai ya nahi
    if (tweet.owner.toString() !== userId) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            {},
            'Aapko ye tweet delete karne ka permission nahi hai'
          )
        );
    }

    // Tweet delete karo
    await tweet.remove();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Tweet successfully delete kiya gaya'));
  } catch (error) {
    console.error('Tweet delete karte waqt kuch galat ho gaya:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(500, {}, 'Tweet delete karte waqt kuch galat ho gaya')
      );
  }
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
