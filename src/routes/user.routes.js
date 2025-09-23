import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  getFeed,
  recommendedVideos,
  recommendChannels,
  getHistory,
} from '../controllers/user.controller.js';
import { getLikedVideos } from '../controllers/like.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// -------------------- PUBLIC ROUTES --------------------

// Register user with avatar and optional cover image
router.post(
  '/register',
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ]),
  registerUser
);

// User login
router.post('/login', loginUser);

// Refresh access token
router.post('/refresh-token', refreshAccessToken);

// -------------------- PROTECTED ROUTES --------------------
router.use(verifyJWT); // All routes below require authentication

// Logout user
router.post('/logout', logoutUser);

// Get current user details
router.get('/me', getCurrentUser);

// Change current password
router.patch('/change-password', changeCurrentPassword);

// Update account details
router.patch('/update-account', updateAccountDetails);

// Update avatar
router.patch('/update-avatar', upload.single('avatar'), updateUserAvatar);

// Update cover image
router.patch(
  '/update-cover',
  upload.single('coverImage'),
  updateUserCoverImage
);

// Get user channel profile by username
router.get('/channel/:username', getUserChannelProfile);

// Watch history
router.get('/watch-history', getWatchHistory); // Changed from /history

// Get feed from subscriptions
router.get('/feed', getFeed);

// Recommended videos
router.get('/recommended-videos', recommendedVideos);

// Recommended channels
router.get('/recommended-channels', recommendChannels);

// Liked videos
router.get('/liked-videos', getLikedVideos);

// Video history (views)
router.get('/history', getHistory);

export default router;
