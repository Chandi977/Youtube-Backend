import mongoose, { isValidObjectId } from 'mongoose';
import { Video } from '../models/video.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
// import ffmpeg from 'fluent-ffmpeg';

// Saare videos ko paginate, sort, aur filter ke saath laane ka function
const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1, // Default page 1 set karo
    limit = 10, // Default limit 10 set karo
    query, // Search query agar diya ho
    sortBy = 'createdAt', // Kis cheez pe sort karna hai, default createdAt
    sortType = 'desc', // Sorting ka type ascending ya descending
    userId, // Specific user ke videos chahiye kya?
  } = req.query;

  const matchCriteria = {}; // Filter ke liye criteria banate hain

  // Agar search query hai to title ko match karo
  if (query) {
    matchCriteria.title = { $regex: query, $options: 'i' }; // Case-insensitive search
  }

  // Agar specific user ka video chahiye to owner ke hisaab se filter karo
  if (userId && isValidObjectId(userId)) {
    matchCriteria.owner = mongoose.Types.ObjectId(userId);
  }

  // Find query ke saath videos fetch karo
  const videos = await Video.find(matchCriteria)
    .sort({ [sortBy]: sortType === 'asc' ? 1 : -1 }) // Sort dynamic hai, ascending ya descending
    .skip((page - 1) * limit) // Pagination ke liye skip karo
    .limit(parseInt(limit)); // Limit lagao

  const totalVideos = await Video.countDocuments(matchCriteria); // Total videos ka count le lo

  return res.status(200).json(
    new ApiResponse(
      200,
      { videos, total: totalVideos },
      'Videos fetched successfully.' // Success message
    )
  );
});

// Naya video publish karne ka function
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description, duration } = req.body;

  // Access uploaded files from req.files
  const videoFile = req.files['videoFile'][0]; // Get the first uploaded video file
  const thumbnail = req.files['thumbnail'][0]; // Get the first uploaded thumbnail file

  try {
    // Validate required fields
    if (!title || !description || !videoFile || !thumbnail || !duration) {
      throw new ApiError(
        400,
        'Title, description, video file, thumbnail, and duration are required.'
      );
    }

    // Upload video file and thumbnail to Cloudinary
    const videoFileUrl = await uploadOnCloudinary(videoFile.path); // Use the path to upload
    const thumbnailUrl = await uploadOnCloudinary(thumbnail.path); // Use the path to upload

    // Create a new video document in the database
    const newVideo = await Video.create({
      videoFile: videoFileUrl,
      thumbnail: thumbnailUrl,
      title,
      description,
      duration, // Use the duration sent from Postman
      owner: req.user.id,
    });

    if (!newVideo) {
      throw new ApiError(500, newVideo, 'Failed to publish video.');
    }

    return res
      .status(201)
      .json(new ApiResponse(201, newVideo, 'Video published successfully.'));
  } catch (error) {
    console.error('Error publishing video:', error);
    return res.status(500).json(new ApiResponse(500, 'Internal Server Error'));
  }
});

// Video ko ID ke hisaab se fetch karne ka function
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  // Agar videoId valid nahi hai to error throw karo
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  // Video ko find karo aur owner ke details populate karo
  const video = await Video.findById(videoId).populate(
    'owner',
    'fullName username avatar'
  );

  // Agar video nahi mila to error throw karo
  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, 'Video fetched successfully.'));
});

// Video details ko update karne ka function
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  // Agar videoId valid nahi hai to error throw karo
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  // Update ke liye jo fields available hain unhe updateData object mein daalo
  const updateData = {};
  if (title) updateData.title = title;
  if (description) updateData.description = description;

  // Agar naya video file diya hai to uska URL Cloudinary se le lo
  if (req.file) {
    updateData.videoUrl = await uploadOnCloudinary(req.file.path);
  }

  // Video ko find karke update karo
  const updatedVideo = await Video.findByIdAndUpdate(videoId, updateData, {
    new: true, // Updated version ko return karte hain
  });

  // Agar video nahi mila to error throw karo
  if (!updatedVideo) {
    throw new ApiError(404, 'Video not found.');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, 'Video updated successfully.'));
});

// Video ko delete karne ka function
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  // Agar videoId valid nahi hai to error throw karo
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  // Video ko find karke delete karo
  const deletedVideo = await Video.findByIdAndDelete(videoId);

  // Agar video nahi mila to error throw karo
  if (!deletedVideo) {
    throw new ApiError(404, 'Video not found.');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Video deleted successfully.'));
});

// Video ka publish status toggle karne ka function (published/unpublished)
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  // Agar videoId valid nahi hai to error throw karo
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  // Video ko find karo
  const video = await Video.findById(videoId);

  // Agar video nahi mila to error throw karo
  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  // Publish status ko toggle karo (true to false or vice-versa)
  video.isPublished = !video.isPublished;
  await video.save();

  return res
    .status(200)
    .json(
      new ApiResponse(200, video, 'Video publish status toggled successfully.')
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
