import { Router } from 'express';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  publishAVideo,
  getAllVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  recordView,
  searchVideos,
} from '../controllers/video.controller.js';

const router = Router();

// Protected routes
router.use(verifyJWT);

// Video upload/publish route
router.route('/upload').post(
  upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  publishAVideo // Changed from uploadVideo to publishAVideo
);

// Other video routes
router.route('/').get(getAllVideos);
router.route('/search').get(searchVideos);
router
  .route('/:videoId')
  .get(getVideoById)
  .patch(updateVideo)
  .delete(deleteVideo);
router.route('/:videoId/toggle-publish').patch(togglePublishStatus);
router.route('/:videoId/view').post(recordView);

export default router;
