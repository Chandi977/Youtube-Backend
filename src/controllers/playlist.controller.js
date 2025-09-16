import mongoose, { isValidObjectId } from 'mongoose';
import { Playlist } from '../models/playlist.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  isRedisEnabled,
  redisGet,
  redisSet,
  redisDel,
} from '../utils/upstash.js';

// --------------------- Create Playlist ---------------------
const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const creator = req.user.id;

  const newPlaylist = await Playlist.create({
    name,
    description,
    owner: creator,
    videos: [],
  });

  // Invalidate user playlists cache
  if (isRedisEnabled) {
    await redisDel(`user:${creator}:playlists`);
  }

  res
    .status(201)
    .json(new ApiResponse(201, newPlaylist, 'Playlist created successfully'));
});

// --------------------- Get User Playlists ---------------------
const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) throw new ApiError(400, 'Invalid user ID');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`user:${userId}:playlists`);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(200, JSON.parse(cached), 'User playlists fetched')
        );
  }

  const playlists = await Playlist.find({ owner: userId })
    .select('name description videos')
    .populate('videos', 'title');

  // Cache the result
  if (isRedisEnabled) {
    await redisSet(`user:${userId}:playlists`, JSON.stringify(playlists));
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlists, 'User playlists fetched'));
});

// --------------------- Get Playlist by ID ---------------------
const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  if (!isValidObjectId(playlistId))
    throw new ApiError(400, 'Invalid playlist id');

  // Check cache first
  if (isRedisEnabled) {
    const cached = await redisGet(`playlist:${playlistId}`);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, JSON.parse(cached), 'Playlist fetched'));
  }

  const playlist = await Playlist.findById(playlistId).populate(
    'videos',
    'title'
  );

  if (!playlist) throw new ApiError(404, 'Playlist not found');

  // Cache the playlist
  if (isRedisEnabled) {
    await redisSet(`playlist:${playlistId}`, JSON.stringify(playlist));
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlist, 'Playlist fetched successfully'));
});

// --------------------- Add Video to Playlist ---------------------
const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (!isValidObjectId(playlistId) || !isValidObjectId(videoId))
    throw new ApiError(400, 'Invalid playlist or video ID');

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, 'Playlist not found');

  playlist.videos.push(videoId);
  await playlist.save();

  // Invalidate cache
  if (isRedisEnabled) {
    await redisDel(`playlist:${playlistId}`);
    await redisDel(`user:${playlist.owner}:playlists`);
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlist, 'Video added to playlist'));
});

// --------------------- Remove Video from Playlist ---------------------
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, 'Playlist not found');

  playlist.videos = playlist.videos.filter((v) => v.toString() !== videoId);
  await playlist.save();

  // Invalidate cache
  if (isRedisEnabled) {
    await redisDel(`playlist:${playlistId}`);
    await redisDel(`user:${playlist.owner}:playlists`);
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlist, 'Video removed from playlist'));
});

// --------------------- Update Playlist ---------------------
const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;
  const userId = req.user.id;

  if (!isValidObjectId(playlistId))
    throw new ApiError(400, 'Invalid playlist id');

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, 'Playlist not found');

  if (playlist.owner.toString() !== userId)
    return res
      .status(403)
      .json(new ApiResponse(403, null, 'Unauthorized to update this playlist'));

  playlist.name = name;
  playlist.description = description;
  await playlist.save({ validateBeforeSave: false });

  // Invalidate cache
  if (isRedisEnabled) {
    await redisDel(`playlist:${playlistId}`);
    await redisDel(`user:${playlist.owner}:playlists`);
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlist, 'Playlist updated successfully'));
});

// --------------------- Delete Playlist ---------------------
const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(playlistId))
    throw new ApiError(400, 'Invalid playlist id');

  const playlist = await Playlist.findById(playlistId);
  if (!playlist) throw new ApiError(404, 'Playlist not found');

  if (playlist.owner.toString() !== userId)
    return res
      .status(403)
      .json(new ApiResponse(403, null, 'Unauthorized to delete this playlist'));

  await Playlist.deleteOne({ _id: playlistId });

  // Invalidate cache
  if (isRedisEnabled) {
    await redisDel(`playlist:${playlistId}`);
    await redisDel(`user:${playlist.owner}:playlists`);
  }

  res
    .status(200)
    .json(new ApiResponse(200, playlist, 'Playlist deleted successfully'));
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  updatePlaylist,
  deletePlaylist,
};
