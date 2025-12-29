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
  getWatchHistory,
  getVideosByUser,
} from '../controllers/video.controller.js';

const router = Router();

/** ================= PUBLIC ROUTES ================= */
// Fetch all videos
router.get('/getvideos', getAllVideos);

// Search videos
router.get('/search', searchVideos);

/** ================= FILTERED ROUTES (public) ================= */
// Middleware to safely add filters without mutating req.query
const addFilter = (filter) => (req, res, next) => {
  req.filter = { ...req.query, ...filter };
  next();
};

// Trending videos (top 10 by viewsCount)
router.get(
  '/trending/top',
  addFilter({
    sortBy: 'viewsCount',
    sortType: 'desc',
    limit: 10,
    isPublished: true,
  }),
  getAllVideos
);

// Published videos
router.get('/published/all', addFilter({ isPublished: true }), getAllVideos);

// Unpublished videos
router.get('/unpublished/all', addFilter({ isPublished: false }), getAllVideos);

// Get videos by user
router.get('/user/:userId', getVideosByUser);

// Get video by ID
router.get('/:videoId', getVideoById);

// Stream video with range requests
router.get('/stream/:videoId', streamVideo);

// Record video view (allow guests; controller dedupes per user/IP)
router.post('/:videoId/view', recordView);

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

// Watch history
router.get('/watch-history', verifyJWT, getWatchHistory);

// Update video
router.patch('/:videoId', updateVideo);

// Delete video
router.delete('/:videoId', deleteVideo);

// Toggle publish status
router.patch('/:videoId/toggle-publish', togglePublishStatus);

export default router;
