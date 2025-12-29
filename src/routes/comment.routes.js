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
import { validate } from '../middlewares/validate.middleware.js';
import {
  addCommentSchema,
  updateCommentSchema,
  commentIdParamsSchema,
  videoIdParamsSchema,
} from '../validators/comment.schema.js';

const router = Router();

// Public route: anyone can view comments for a video
router.get(
  '/:videoId',
  validate({ params: videoIdParamsSchema }),
  attachUserIfPresent,
  getVideoComments
);

// Protected routes: only authenticated users can perform these actions
router.use(verifyJWT);

// Add a new comment or reply
router.post('/', validate({ body: addCommentSchema }), addComment);

// Update or delete a comment/reply
router.patch(
  '/:commentId',
  validate({ params: commentIdParamsSchema, body: updateCommentSchema }),
  updateComment
);
router.delete(
  '/:commentId',
  validate({ params: commentIdParamsSchema }),
  deleteComment
);

export default router;
