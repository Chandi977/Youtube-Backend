import mongoose, { isValidObjectId } from 'mongoose';
import { User } from '../models/user.model.js';
import { Subscription } from '../models/subscription.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  redisGet,
  redisSet,
  isRedisEnabled,
  redisDel,
} from '../utils/upstash.js';

// -------------------- Toggle subscription --------------------
const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;

  if (userId === channelId) {
    throw new ApiError(400, 'You cannot subscribe to your own channel');
  }

  if (!isValidObjectId(channelId))
    throw new ApiError(400, 'Invalid channel ID');

  // Ensure channel exists
  const channel = await User.findById(channelId).select('_id username');
  if (!channel) throw new ApiError(404, 'Channel not found');

  let isSubscribed = false;

  // Check if subscription exists
  const subscription = await Subscription.findOne({
    subscriber: userId,
    channel: channelId,
  });

  if (subscription) {
    // Unsubscribe
    await Subscription.deleteOne({ _id: subscription._id });
    isSubscribed = false;
  } else {
    // Subscribe
    await Subscription.create({ subscriber: userId, channel: channelId });
    isSubscribed = true;
  }

  // Always recalc subscribers count
  const subscribersCount = await Subscription.countDocuments({
    channel: channelId,
  });

  // Invalidate cache
  if (isRedisEnabled) {
    await redisDel(`user:${userId}:subscriptions`);
    await redisDel(`channel:${channelId}:subscribers`);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isSubscribed, subscribersCount },
        isSubscribed ? 'Subscribed successfully' : 'Unsubscribed successfully'
      )
    );
});

// -------------------- Get all subscribers of a channel --------------------
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId))
    throw new ApiError(400, 'Invalid channel ID');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`channel:${channelId}:subscribers`);
    if (cached) {
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Subscribers fetched from cache'));
    }
  }

  const subscribers = await Subscription.find({ channel: channelId }).populate(
    'subscriber',
    'username avatar'
  );

  // Cache the result
  if (isRedisEnabled)
    await redisSet(`channel:${channelId}:subscribers`, subscribers);

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscribers, 'Subscribers fetched successfully')
    );
});

// -------------------- Get all channels a user is subscribed to --------------------
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId))
    throw new ApiError(400, 'Invalid subscriber ID');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`user:${subscriberId}:subscriptions`);
    if (cached) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, cached, 'Subscribed channels fetched from cache')
        );
    }
  }

  const subscriptions = await Subscription.find({
    subscriber: subscriberId,
  }).populate('channel', 'username avatar');

  // Cache the result
  if (isRedisEnabled)
    await redisSet(`user:${subscriberId}:subscriptions`, subscriptions);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        subscriptions,
        'Subscribed channels fetched successfully'
      )
    );
});

const getChannelSubscriberCount = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId))
    throw new ApiError(400, 'Invalid channel ID');

  const count = await Subscription.countDocuments({ channel: channelId });

  return res
    .status(200)
    .json(new ApiResponse(200, { count }, 'Subscriber count fetched'));
});

export {
  toggleSubscription,
  getUserChannelSubscribers,
  getSubscribedChannels,
  getChannelSubscriberCount,
};
