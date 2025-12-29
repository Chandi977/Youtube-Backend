import { Router } from 'express';
import {
  toggleVideoLike,
  toggleCommentLike,
  toggleTweetLike,
  getLikedVideos,
  getVideoLikes,
  getCommentLikes,
  getTweetLikes,
} from '../controllers/like.controller.js';
import {
  verifyJWT,
  attachUserIfPresent,
} from '../middlewares/auth.middleware.js';

const router = Router();

// Public: allow everyone to read like counts
router.route('/v/:videoId').get(attachUserIfPresent, getVideoLikes); // count + isLiked (isLiked only if authed)
router.route('/c/:commentId').get(attachUserIfPresent, getCommentLikes);
router.route('/t/:tweetId').get(attachUserIfPresent, getTweetLikes);

// Protected routes
router.use(verifyJWT);

// -------- Video Likes --------
router.route('/v/:videoId/toggle').post(toggleVideoLike);

// -------- Comment Likes --------
router.route('/c/:commentId/toggle').post(toggleCommentLike);

// -------- Tweet Likes --------
router.route('/t/:tweetId/toggle').post(toggleTweetLike);

// -------- Liked Videos (for current user) --------
router.route('/videos').get(getLikedVideos);

export default router;
