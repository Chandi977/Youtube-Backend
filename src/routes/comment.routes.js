import { Router } from 'express';
import {
  addComment,
  deleteComment,
  getVideoComments,
  updateComment,
} from '../controllers/comment.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Public route: anyone can view comments for a video
router.route('/:videoId').get(getVideoComments);

// Protected routes: only authenticated users can perform these actions
router.use(verifyJWT);

router.route('/:videoId').post(addComment);
router.route('/c/:commentId').delete(deleteComment).patch(updateComment);

export default router;
