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
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(verifyJWT); // Protect all routes

// -------- Video Likes --------
router.route('/v/:videoId/toggle').post(toggleVideoLike);
router.route('/v/:videoId').get(getVideoLikes); // count + isLiked

// -------- Comment Likes --------
router.route('/c/:commentId/toggle').post(toggleCommentLike);
router.route('/c/:commentId').get(getCommentLikes); // count + isLiked

// -------- Tweet Likes --------
router.route('/t/:tweetId/toggle').post(toggleTweetLike);
router.route('/t/:tweetId').get(getTweetLikes); // count + isLiked

// -------- Liked Videos (for current user) --------
router.route('/videos').get(getLikedVideos);

export default router;
