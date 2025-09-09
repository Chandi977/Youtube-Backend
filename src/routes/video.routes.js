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

/** ================= PUBLIC ROUTES ================= */
// Fetch all videos with optional pagination/filter
router.get('/getvideos', getAllVideos);

// Search videos
router.get('/search', searchVideos);

// Get video by ID
router.get('/:videoId', getVideoById);

// Get videos by user (owner)
router.get('/user/:userId', getAllVideos);

/** ================= PROTECTED ROUTES ================= */
router.use(verifyJWT);

// Upload/publish video
router.post(
  '/upload',
  upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  publishAVideo
);

// Update video
router.patch('/:videoId', updateVideo);

// Delete video
router.delete('/:videoId', deleteVideo);

// Toggle publish status
router.patch('/:videoId/toggle-publish', togglePublishStatus);

// Record video view
router.post('/:videoId/view', recordView);

/** ================= NEW ROUTES ================= */
// Fetch published videos only
router.get(
  '/published/all',
  (req, res, next) => {
    req.query.isPublished = true;
    next();
  },
  getAllVideos
);

// Fetch unpublished videos only (admin/owner)
router.get(
  '/unpublished/all',
  (req, res, next) => {
    req.query.isPublished = false;
    next();
  },
  getAllVideos
);

// Fetch top trending videos (sorted by views)
router.get(
  '/trending/top',
  (req, res, next) => {
    req.query.sortBy = 'views';
    req.query.sortType = 'desc';
    req.query.limit = 10; // top 10
    next();
  },
  getAllVideos
);

export default router;
