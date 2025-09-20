import { Router } from 'express';
import {
  createLiveStream,
  startLiveStream,
  endLiveStream,
  getLiveStreams,
  getLiveStream,
  joinLiveStream,
  leaveLiveStream,
  getStreamAnalytics,
  updateStreamSettings,
  deleteLiveStream,
} from '../controllers/live.controller.js';
import {
  addLiveComment,
  getLiveComments,
  toggleLiveCommentLike,
  replyToLiveComment,
  toggleCommentPin,
  deleteLiveComment,
  getFeaturedComments,
} from '../controllers/liveComment.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(verifyJWT);

// Live Stream Routes
router
  .route('/')
  .get(getLiveStreams) // Get all live streams with filters
  .post(upload.fields([{ name: 'thumbnail', maxCount: 1 }]), createLiveStream); // Create new stream

router
  .route('/:streamId')
  .get(getLiveStream) // Get single stream details
  .patch(updateStreamSettings) // Update stream settings
  .delete(deleteLiveStream); // Delete stream

// Stream Control Routes
router.route('/:streamId/start').post(startLiveStream); // Start streaming
router.route('/:streamId/end').post(endLiveStream); // End streaming
router.route('/:streamId/join').post(joinLiveStream); // Join as viewer
router.route('/:streamId/leave').post(leaveLiveStream); // Leave as viewer
router.route('/:streamId/analytics').get(getStreamAnalytics); // Get analytics (owner only)

// Comment Routes
router
  .route('/:streamId/comments')
  .get(getLiveComments) // Get stream comments
  .post(addLiveComment); // Add new comment

router.route('/:streamId/comments/featured').get(getFeaturedComments); // Get featured comments

router.route('/comments/:commentId/like').post(toggleLiveCommentLike); // Like/unlike comment
router.route('/comments/:commentId/reply').post(replyToLiveComment); // Reply to comment
router.route('/comments/:commentId/pin').patch(toggleCommentPin); // Pin/unpin comment
router.route('/comments/:commentId').delete(deleteLiveComment); // Delete comment

export default router;
