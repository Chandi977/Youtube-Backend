import mongoose, { isValidObjectId } from 'mongoose';
import { Video } from '../models/video.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

// PUBLISH VIDEO
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const videoFile = req.files?.['videoFile']?.[0];
  const thumbnail = req.files?.['thumbnail']?.[0];

  if (!title?.trim() || !description?.trim() || !videoFile || !thumbnail) {
    throw new ApiError(400, 'All fields are required');
  }

  let videoFileUrl;
  let thumbnailUrl;

  try {
    videoFileUrl = await uploadOnCloudinary(videoFile.path);
    thumbnailUrl = await uploadOnCloudinary(thumbnail.path);

    if (!videoFileUrl) {
      throw new ApiError(400, 'Error while uploading video');
    }
  } catch (error) {
    throw new ApiError(400, error?.message || 'Error while uploading files');
  }

  const newVideo = await Video.create({
    videoFile: {
      url: videoFileUrl.url,
      public_id: videoFileUrl.public_id,
    },
    thumbnail: {
      url: thumbnailUrl.url,
      public_id: thumbnailUrl.public_id,
    },
    title: title.trim(),
    description: description.trim(),
    duration: Math.round(videoFileUrl.duration || 0),
    owner: req.user._id,
    isPublished: true,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newVideo, 'Video published successfully'));
});

// GET ALL VIDEOS
const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query,
    sortBy = 'createdAt',
    sortType = 'desc',
    userId,
  } = req.query;

  const matchCriteria = {};
  if (query) matchCriteria.title = { $regex: query, $options: 'i' };
  if (userId && isValidObjectId(userId))
    matchCriteria.owner = mongoose.Types.ObjectId(userId);

  const videos = await Video.find(matchCriteria)
    .sort({ [sortBy]: sortType === 'asc' ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const totalVideos = await Video.countDocuments(matchCriteria);

  return res
    .status(200)
    .json(new ApiResponse(200, { videos, total: totalVideos }));
});

// GET VIDEO BY ID
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');

  const video = await Video.findById(videoId).populate(
    'owner',
    'fullName username avatar'
  );
  if (!video) throw new ApiError(404, 'Video not found.');

  return res
    .status(200)
    .json(new ApiResponse(200, video, 'Video fetched successfully.'));
});

// UPDATE VIDEO
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');

  const updateData = {};
  if (req.body.title) updateData.title = req.body.title;
  if (req.body.description) updateData.description = req.body.description;
  if (req.file) updateData.videoFile = await uploadOnCloudinary(req.file.path);

  const updatedVideo = await Video.findByIdAndUpdate(videoId, updateData, {
    new: true,
  });
  if (!updatedVideo) throw new ApiError(404, 'Video not found.');

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, 'Video updated successfully.'));
});

// DELETE VIDEO
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');

  const deletedVideo = await Video.findByIdAndDelete(videoId);
  if (!deletedVideo) throw new ApiError(404, 'Video not found.');

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Video deleted successfully.'));
});

// TOGGLE PUBLISH STATUS
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID.');

  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');

  video.isPublished = !video.isPublished;
  await video.save();

  return res
    .status(200)
    .json(new ApiResponse(200, video, 'Video publish status toggled.'));
});

// RECORD VIDEO VIEW
const recordView = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found.');

  video.views = (video.views || 0) + 1;
  await video.save();

  return res
    .status(200)
    .json(new ApiResponse(200, video, 'View recorded successfully.'));
});

// SEARCH VIDEOS
const searchVideos = asyncHandler(async (req, res) => {
  const { searchterm } = req.query;
  if (!searchterm) throw new ApiError(400, 'Please enter the search term.');

  const videos = await Video.find({
    $or: [
      { title: { $regex: searchterm, $options: 'i' } },
      { description: { $regex: searchterm, $options: 'i' } },
    ],
  });

  return res
    .status(200)
    .json(new ApiResponse(200, videos, 'Search results fetched.'));
});

export {
  publishAVideo,
  getAllVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  recordView,
  searchVideos,
};
