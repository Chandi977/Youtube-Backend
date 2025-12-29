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
import { validate } from '../middlewares/validate.middleware.js';
import {
  videoLikeParamsSchema,
  commentLikeParamsSchema,
  tweetLikeParamsSchema,
} from '../validators/like.schema.js';

const router = Router();

// Public: allow everyone to read like counts
router
  .route('/v/:videoId')
  .get(validate({ params: videoLikeParamsSchema }), attachUserIfPresent, getVideoLikes); // count + isLiked (isLiked only if authed)
router
  .route('/c/:commentId')
  .get(validate({ params: commentLikeParamsSchema }), attachUserIfPresent, getCommentLikes);
router
  .route('/t/:tweetId')
  .get(validate({ params: tweetLikeParamsSchema }), attachUserIfPresent, getTweetLikes);

// Protected routes
router.use(verifyJWT);

// -------- Video Likes --------
router
  .route('/v/:videoId/toggle')
  .post(validate({ params: videoLikeParamsSchema }), toggleVideoLike);

// -------- Comment Likes --------
router
  .route('/c/:commentId/toggle')
  .post(validate({ params: commentLikeParamsSchema }), toggleCommentLike);

// -------- Tweet Likes --------
router
  .route('/t/:tweetId/toggle')
  .post(validate({ params: tweetLikeParamsSchema }), toggleTweetLike);

// -------- Liked Videos (for current user) --------
router.route('/videos').get(getLikedVideos);

export default router;
