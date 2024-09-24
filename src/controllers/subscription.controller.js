import mongoose, { isValidObjectId } from 'mongoose';
import { User } from '../models/user.model.js';
import { Subscription } from '../models/subscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const toggleSubscription = asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;

    // Check karo ki `channelId` valid hai ya nahi
    if (!isValidObjectId(channelId)) {
      return res.status(400).json(new ApiError(400, 'Invalid channel ID'));
    }

    // User ID nikaalo jo subscribe/unsubscribe kar raha hai
    const userId = req.user.id;

    // Channel ko database mein se dhoondho
    const channel = await User.findById(channelId);

    if (!channel) {
      throw new ApiError(404, 'Channel not found');
    }

    // Pehle check karo ki subscription pehle se hai ya nahi
    const subscription = await Subscription.findOne({
      subscriber: userId,
      channel: channelId,
    });

    // Agar subscription pehle se hai to remove kar do (unsubscribe)
    if (subscription) {
      await subscription.remove();
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            'Subscription removed',
            'Subscription remove ho gayi successfully'
          )
        );
    } else {
      // Agar nahi hai to create kar do (subscribe)
      await Subscription.create({
        subscriber: userId,
        channel: channelId,
      });
      return res
        .status(201)
        .json(
          new ApiResponse(
            201,
            'Subscription added',
            'Subscription add ho gayi successfully'
          )
        );
    }
  } catch (error) {
    console.error('Something went wrong:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          error.message,
          'Subscription toggle karte waqt kuch galat ho gaya'
        )
      );
  }
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;

    // Check karo ki `channelId` valid hai ya nahi
    if (!isValidObjectId(channelId)) {
      return res.status(400).json(new ApiError(400, 'Invalid channel ID'));
    }

    // Channel ke saare subscribers ko dhoondo
    const subscribers = await Subscription.find({
      channel: channelId,
    }).populate('subscriber', 'username');

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          subscribers,
          'Subscribers successfully fetch ho gaye'
        )
      );
  } catch (error) {
    console.error('Something went wrong:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          error.message,
          'Subscribers fetch karte waqt kuch galat ho gaya'
        )
      );
  }
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
  try {
    const { subscriberId } = req.params;

    // Check karo ki `subscriberId` valid hai ya nahi
    if (!isValidObjectId(subscriberId)) {
      return res.status(400).json(new ApiError(400, 'Invalid subscriber ID'));
    }

    // Subscriber ke saare channels fetch karo
    const subscriptions = await Subscription.find({
      subscriber: subscriberId,
    }).populate('channel', 'username');

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          subscriptions,
          'Subscribed channels fetch ho gaye successfully'
        )
      );
  } catch (error) {
    console.error('Something went wrong:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          error.message,
          'Subscribed channels fetch karte waqt kuch galat ho gaya'
        )
      );
  }
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
