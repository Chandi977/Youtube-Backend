import mongoose, { isValidObjectId } from 'mongoose';
import { User } from '../models/user.model.js';
import { Subscription } from '../models/subscription.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { redisGet, redisSet, isRedisEnabled } from '../utils/upstash.js';

// Toggle subscription (subscribe/unsubscribe)
const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const userId = req.user.id;

  if (userId === channelId) {
    throw new ApiError(400, 'You cannot subscribe to your own channel');
  }

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, 'Invalid channel ID');
  }

  // Fetch channel (cache optional)
  const channel = await User.findById(channelId).select('_id username');
  if (!channel) throw new ApiError(404, 'Channel not found');

  // Check subscription
  const subscription = await Subscription.findOne({
    subscriber: userId,
    channel: channelId,
  });

  if (subscription) {
    await Subscription.deleteOne({ _id: subscription._id });
    if (isRedisEnabled) {
      await redisSet(`user:${userId}:subscriptions`, null); // invalidate cache
      await redisSet(`channel:${channelId}:subscribers`, null);
    }
    return res
      .status(200)
      .json(new ApiResponse(200, null, 'Unsubscribed successfully'));
  } else {
    await Subscription.create({ subscriber: userId, channel: channelId });
    if (isRedisEnabled) {
      await redisSet(`user:${userId}:subscriptions`, null); // invalidate cache
      await redisSet(`channel:${channelId}:subscribers`, null);
    }
    return res
      .status(201)
      .json(new ApiResponse(201, null, 'Subscribed successfully'));
  }
});

// Get all subscribers of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!isValidObjectId(channelId))
    throw new ApiError(400, 'Invalid channel ID');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`channel:${channelId}:subscribers`);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cached),
            'Subscribers fetched from cache'
          )
        );
  }

  const subscribers = await Subscription.find({ channel: channelId }).populate(
    'subscriber',
    'username avatar'
  );

  if (isRedisEnabled)
    await redisSet(
      `channel:${channelId}:subscribers`,
      JSON.stringify(subscribers)
    );

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscribers, 'Subscribers fetched successfully')
    );
});

// Get all channels a user is subscribed to
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!isValidObjectId(subscriberId))
    throw new ApiError(400, 'Invalid subscriber ID');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`user:${subscriberId}:subscriptions`);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cached),
            'Subscribed channels fetched from cache'
          )
        );
  }

  const subscriptions = await Subscription.find({
    subscriber: subscriberId,
  }).populate('channel', 'username avatar');

  if (isRedisEnabled)
    await redisSet(
      `user:${subscriberId}:subscriptions`,
      JSON.stringify(subscriptions)
    );

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

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
