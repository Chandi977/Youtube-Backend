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
  streamVideo,
} from '../controllers/video.controller.js';

const router = Router();

/** ================= PUBLIC ROUTES ================= */
// Fetch all videos
router.get('/getvideos', getAllVideos);

// Search videos
router.get('/search', searchVideos);

// Get video by ID
router.get('/:videoId', getVideoById);

// Get videos by user
router.get('/user/:userId', getAllVideos);

// Stream video with range requests ✅
router.get('/stream/:videoId', streamVideo);

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

/** ================= FILTERED ROUTES ================= */
// Middleware to safely add filters without mutating req.query
const addFilter = (filter) => (req, res, next) => {
  req.filter = { ...req.query, ...filter }; // safe
  next();
};

// Published videos
router.get('/published/all', addFilter({ isPublished: true }), getAllVideos);

// Unpublished videos
router.get('/unpublished/all', addFilter({ isPublished: false }), getAllVideos);

// Trending videos (top 10 by viewsCount)
router.get(
  '/trending/top',
  addFilter({ sortBy: 'viewsCount', sortType: 'desc', limit: 10 }),
  getAllVideos
);

export default router;
