import { Router } from 'express';
import {
  getSubscribedChannels,
  getUserChannelSubscribers,
  toggleSubscription,
  getChannelSubscriberCount,
} from '../controllers/subscription.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/count/:channelId', getChannelSubscriberCount);

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

// Toggle subscription
router.route('/c/:channelId').post(toggleSubscription);

// Get all channels a user is subscribed to
router.route('/c/:subscriberId').get(getSubscribedChannels);

// Get all subscribers of a channel
router.route('/u/:channelId').get(getUserChannelSubscribers);

export default router;
