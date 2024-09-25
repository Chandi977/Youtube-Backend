import mongoose, { isValidObjectId } from 'mongoose';
import { Playlist } from '../models/playlist.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Playlist banane ka function
const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  try {
    const creator = req.user.id; // User se jo create kar raha hai uska ID lena

    // Naya playlist banao
    const newPlaylist = await Playlist.create({
      name,
      description,
      owner: creator,
      videos: [],
    });

    return res
      .status(200)
      .json(new ApiResponse(200, 'Playlist created successfully', newPlaylist));
  } catch (error) {
    console.error('Error creating playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, 'Error creating playlist', error.message));
  }
});

// User ke sare playlists lene ka function
const getUserPlaylists = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json(new ApiResponse(400, userId, 'Invalid user id:'));
    }

    // Playlist fetch karo based on user ID
    const playlists = await Playlist.find({ owner: userId })
      .select('name description videos')
      .populate('videos', 'title');

    return res
      .status(200)
      .json(
        new ApiResponse(200, playlists, 'User playlists successfully fetched')
      );
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

// Playlist ko ID se fetch karne ka function
const getPlaylistById = asyncHandler(async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!isValidObjectId(playlistId)) {
      throw new ApiError(400, playlistId, 'Invalid playlist id:');
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new ApiError(404, playlistId, 'Playlist not found');
    }

    return res
      .status(200)
      .json(new ApiResponse(200, playlist, 'Playlist successfully fetched'));
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

// Playlist me video add karne ka function
const addVideoToPlaylist = asyncHandler(async (req, res) => {
  try {
    const { playlistId, videoId } = req.params;
    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
      throw new ApiError(400, 'Invalid playlist or video id');
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new ApiError(404, 'Playlist not found');
    }

    // Video playlist me add kar do
    playlist.videos.push(videoId);
    await playlist.save();

    return res
      .status(200)
      .json(
        new ApiResponse(200, playlist, 'Video added to playlist successfully')
      );
  } catch (error) {
    console.error('Error adding video to playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

// Playlist se video remove karne ka function
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  try {
    const { playlistId, videoId } = req.params;
    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
      throw new ApiError(400, 'Invalid playlist or video id');
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new ApiError(404, 'Playlist not found');
    }

    const videoIndex = playlist.videos.indexOf(videoId);

    // Agar video playlist me nahi hai
    if (videoIndex === -1) {
      throw new ApiError(404, 'Video not found in playlist');
    }

    // Video remove kar do
    playlist.videos.splice(videoIndex, 1);
    await playlist.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          playlist,
          'Video removed from playlist successfully'
        )
      );
  } catch (error) {
    console.error('Error removing video from playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

// Playlist delete karne ka function
const deletePlaylist = asyncHandler(async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = req.user.id;

    if (!isValidObjectId(playlistId)) {
      throw new ApiError(400, 'Invalid playlist id');
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new ApiError(404, 'Playlist not found');
    }

    // Agar playlist ka owner user nahi hai toh unauthorized response do
    if (playlist.owner.toString() !== userId) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, 'Unauthorized to delete this playlist', null)
        );
    }
    await Playlist.deleteOne({ _id: playlistId });
    // await playlist.remove();
    return res
      .status(200)
      .json(new ApiResponse(200, playlist, 'Playlist deleted successfully'));
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

// Playlist update karne ka function
const updatePlaylist = asyncHandler(async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!isValidObjectId(playlistId)) {
      throw new ApiError(400, 'Invalid playlist id');
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
      throw new ApiError(404, 'Playlist not found');
    }

    // Agar user owner nahi hai toh update nahi karne denge
    if (playlist.owner.toString() !== userId) {
      return res
        .status(403)
        .json(
          new ApiResponse(403, 'Unauthorized to update this playlist', null)
        );
    }

    // Playlist ke name aur description update kar do
    playlist.name = name;
    playlist.description = description;
    await playlist.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResponse(200, playlist, 'Playlist updated successfully'));
  } catch (error) {
    console.error('Error updating playlist:', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error.message, 'Something went wrong'));
  }
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};
