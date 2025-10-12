import { Router } from 'express';
import {
  createTweet,
  deleteTweet,
  getUserTweets,
  updateTweet,
  toggleLikeTweet,
  toggleShareTweet,
  getTweetReplies,
} from '../controllers/tweet.controller.js';
import {
  addTweetComment,
  updateComment,
  deleteComment,
  getTweetComments,
} from '../controllers/comment.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';
const router = Router();

// Apply JWT to protected routes
router.use(verifyJWT);

// Tweet CRUD
router.post('/', upload.single('image'), createTweet);
router.get('/user/:userId', getUserTweets);
router.get('/:tweetId/replies', getTweetReplies);
router.patch('/:tweetId', upload.single('image'), updateTweet);
router.delete('/:tweetId', deleteTweet);
router.post('/:tweetId/like', toggleLikeTweet);
router.post('/:tweetId/share', toggleShareTweet);

// Tweet Comments
router.get('/:tweetId/comments', getTweetComments);
router.post('/:tweetId/comments', addTweetComment);
router.patch('/comments/:commentId', updateComment);
router.delete('/comments/:commentId', deleteComment);

export default router;
