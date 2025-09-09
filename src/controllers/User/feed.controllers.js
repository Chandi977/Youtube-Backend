import { User } from '../../models/user.model.js';
import { Video } from '../../models/video.model.js';
import { View } from '../../models/view.model.js';
import { Like } from '../../models/like.model.js';
import { Subscription } from '../../models/subscription.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// Get feed for current user based on subscriptions
const getFeed = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const subscriptions = await Subscription.find({ subscriber: userId }).select(
    'channel'
  );
  const subscribedChannelIds = subscriptions.map((sub) => sub.channel);

  const videos = await Video.find({ owner: { $in: subscribedChannelIds } })
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  // Add views count to each video
  const videosWithViews = await Promise.all(
    videos.map(async (video) => {
      const views = await View.countDocuments({ video: video._id });
      return { ...video.toObject(), views };
    })
  );

  res
    .status(200)
    .json(new ApiResponse(200, videosWithViews, 'Feed fetched successfully'));
});

// Get recommended videos (latest videos)
const recommendedVideos = asyncHandler(async (req, res) => {
  const videos = await Video.find()
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  const videosWithViews = await Promise.all(
    videos.map(async (video) => {
      const views = await View.countDocuments({ video: video._id });
      return { ...video.toObject(), views };
    })
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        videosWithViews,
        'Recommended videos fetched successfully'
      )
    );
});

// Get user's watch history
const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'watchHistory',
    populate: { path: 'owner', select: 'fullName username avatar' },
  });

  if (!user || !user.watchHistory.length) {
    throw new ApiError(404, 'No watch history found');
  }

  // Get views count for each video in watch history
  const videoIds = user.watchHistory.map((video) => video._id);
  const videoViews = await Video.aggregate([
    { $match: { _id: { $in: videoIds } } },
    {
      $lookup: {
        from: 'likes',
        localField: '_id',
        foreignField: 'video',
        as: 'likes',
      },
    },
    { $addFields: { likesCount: { $size: '$likes' } } },
  ]);

  const watchHistory = user.watchHistory.map((video) => {
    const videoWithViews = videoViews.find((v) => v._id.equals(video._id));
    return {
      ...video.toObject(),
      likesCount: videoWithViews?.likesCount || 0,
    };
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, watchHistory, 'Watch history fetched successfully')
    );
});

// Get liked videos for current user
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const likes = await Like.find({
    likedBy: userId,
    video: { $exists: true },
  }).populate({
    path: 'video',
    populate: { path: 'owner', select: 'username fullName avatar' },
  });

  const likedVideos = likes.map((like) => ({
    video: {
      _id: like.video._id,
      title: like.video.title,
      description: like.video.description,
      duration: like.video.duration,
      views: like.video.views,
      thumbnail: like.video.thumbnail,
    },
    channel: {
      _id: like.video.owner._id,
      username: like.video.owner.username,
      fullName: like.video.owner.fullName,
      avatar: like.video.owner.avatar,
    },
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        likedVideos,
        likedVideos.length
          ? 'Liked videos fetched successfully'
          : 'No liked videos found'
      )
    );
});

// Get complete user view history
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const views = await View.find({ user: userId })
    .populate({
      path: 'video',
      populate: { path: 'owner', select: 'username fullName avatar' },
    })
    .sort({ createdAt: -1 });

  const history = views.map((view) => ({
    _id: view._id,
    watchTime: view.watchTime,
    createdAt: view.createdAt,
    video: {
      _id: view.video._id,
      title: view.video.title,
      description: view.video.description,
      duration: view.video.duration,
      thumbnail: view.video.thumbnail,
      views: view.video.views,
    },
    channel: {
      _id: view.video.owner._id,
      username: view.video.owner.username,
      fullName: view.video.owner.fullName,
      avatar: view.video.owner.avatar,
    },
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        history,
        history.length
          ? 'Watch history fetched successfully'
          : 'No viewing history found'
      )
    );
});

const recommendChannels = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Exclude current user
  const channels = await User.find({ _id: { $ne: userId } })
    .select('username avatar channelDescription')
    .limit(10);

  const channelsWithData = await Promise.all(
    channels.map(async (channel) => {
      const subscribersCount = await Subscription.countDocuments({
        channel: channel._id,
      });
      const isSubscribed = !!(await Subscription.findOne({
        subscriber: userId,
        channel: channel._id,
      }));
      const videosCount = await Video.countDocuments({ owner: channel._id });

      return {
        ...channel.toObject(),
        subscribersCount,
        isSubscribed,
        videosCount,
      };
    })
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        channelsWithData,
        'Recommended channels fetched successfully'
      )
    );
});

export {
  getFeed,
  recommendedVideos,
  recommendChannels,
  getWatchHistory,
  getLikedVideos,
  getHistory,
};
