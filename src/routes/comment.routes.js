import { Router } from 'express';
import {
  addComment,
  deleteComment,
  getVideoComments,
  updateComment,
} from '../controllers/comment.controller.js';
import {
  verifyJWT,
  attachUserIfPresent,
} from '../middlewares/auth.middleware.js';

const router = Router();

// Public route: anyone can view comments for a video
router.get('/:videoId', attachUserIfPresent, getVideoComments);

// Protected routes: only authenticated users can perform these actions
router.use(verifyJWT);

// Add a new comment or reply
router.post('/', addComment);

// Update or delete a comment/reply
router.patch('/:commentId', updateComment);
router.delete('/:commentId', deleteComment);

export default router;
