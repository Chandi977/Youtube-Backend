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

// -------------------- PUBLIC ROUTES --------------------
// Allow guests to browse and view streams/comments
router.route('/').get(getLiveStreams);
router.route('/:streamId').get(getLiveStream);
router.route('/:streamId/comments').get(getLiveComments);
router.route('/:streamId/comments/featured').get(getFeaturedComments);

// -------------------- AUTHENTICATED ROUTES --------------------
router.use(verifyJWT);

// Live Stream creation & management
router
  .route('/')
  .post(upload.fields([{ name: 'thumbnail', maxCount: 1 }]), createLiveStream);

router
  .route('/:streamId')
  .patch(updateStreamSettings) // Update stream settings
  .delete(deleteLiveStream); // Delete stream

// Stream Control Routes
router.route('/:streamId/start').post(startLiveStream); // Start streaming
router.route('/:streamId/end').post(endLiveStream); // End streaming
router.route('/:streamId/join').post(joinLiveStream); // Join as viewer
router.route('/:streamId/leave').post(leaveLiveStream); // Leave as viewer
router.route('/:streamId/analytics').get(getStreamAnalytics); // Get analytics (owner only)

// Comment Routes (write operations)
router.route('/:streamId/comments').post(addLiveComment); // Add new comment
router.route('/comments/:commentId/like').post(toggleLiveCommentLike); // Like/unlike comment
router.route('/comments/:commentId/reply').post(replyToLiveComment); // Reply to comment
router.route('/comments/:commentId/pin').patch(toggleCommentPin); // Pin/unpin comment
router.route('/comments/:commentId').delete(deleteLiveComment); // Delete comment

export default router;
