import mongoose from 'mongoose';
import { Video } from '../models/video.model.js';
import { Subscription } from '../models/subscription.model.js';
import { Like } from '../models/like.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Channel stats fetch karne ka function (like total views, subscribers, videos, likes, etc.)
const getChannelStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.params.userId; // Channel ka user ID le rahe hain

    // Total videos count karo jo user ne upload kiye hain
    const totalVideos = await Video.countDocuments({ owner: userId });

    // Total video views calculate karne ke liye aggregation pipeline
    const totalViewsPipeline = [
      {
        $match: {
          owner: mongoose.Types.ObjectId(userId), // User ID se match karo
        },
      },
      {
        $group: {
          _id: null, // Sab videos ko ek group mein combine kar do
          totalViews: { $sum: '$views' }, // Views ka total sum calculate karo
        },
      },
    ];

    const totalviewsResult = await Video.aggregate(totalViewsPipeline);
    const totalViews =
      totalviewsResult.length > 0 ? totalviewsResult[0].totalViews : 0; // Agar result hai to views le lo, warna 0

    // Total likes count karne ke liye aggregation pipeline
    const totalLikesPipeline = [
      {
        $match: {
          likedBy: mongoose.Types.ObjectId(userId), // User ke likes find karo
        },
      },
      {
        $group: {
          _id: null, // Sab likes ko combine karo
          totalLikes: { $sum: 1 }, // Har like ka 1 count karo
        },
      },
    ];

    const totalLikesResult = await Like.aggregate(totalLikesPipeline);
    const totalLikes =
      totalLikesResult.length > 0 ? totalLikesResult[0].totalLikes : 0; // Agar result hai to total likes le lo, warna 0

    // Total subscribers count karo
    const totalSubscribers = await Subscription.countDocuments({
      channel: userId, // Channel user ID ke hisaab se
    });

    // Success response bhejo with stats
    return res.status(200).json(
      new ApiResponse(
        200,
        { totalViews, totalVideos, totalLikes, totalSubscribers },
        'Channel stats fetched successfully.' // Success message
      )
    );
  } catch (error) {
    console.error('Server error', error);
    // Error response bhejo agar server error hai
    return res.status(500).json(new ApiError(500, 'Server error'));
  }
});

// Channel ke saare videos fetch karne ka function
const getChannelVideos = asyncHandler(async (req, res) => {
  try {
    const { ownerId } = req.params; // Channel owner ka user ID le rahe hain

    // Videos find karne ke liye aggregation pipeline
    const pipeline = [
      {
        $match: {
          owner: mongoose.Types.ObjectId(ownerId), // Owner ke hisaab se videos match karo
        },
      },
      {
        $project: {
          _id: 1, // Video ID le rahe hain
          title: 1, // Video ka title
          description: 1, // Video ka description
          videoFile: 1, // Video file ka URL
        },
      },
    ];

    const userVideos = await Video.aggregate(pipeline); // Pipeline ko execute karo aur videos fetch karo

    // Success response bhejo with videos
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { userVideos },
          'User videos fetched successfully.'
        )
      );
  } catch (error) {
    console.error('Server error', error);
    // Error response bhejo agar server error hai
    return res.status(500).json(new ApiError(500, 'Server error'));
  }
});

export { getChannelStats, getChannelVideos };
