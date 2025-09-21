import { Router } from 'express';
import {
  createTweet,
  deleteTweet,
  getUserTweets,
  updateTweet,
} from '../controllers/tweet.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = Router();

// Apply JWT middleware to all routes
router.use(verifyJWT);

// Create a tweet (text, image, or both)
router.post('/', upload.single('image'), createTweet);

// Get all tweets of a user (no image upload needed)
router.get('/user/:userId', getUserTweets);

// Update a tweet (content and/or image)
router.patch('/:tweetId', upload.single('image'), updateTweet);

// Delete a tweet
router.delete('/:tweetId', deleteTweet);

export default router;
