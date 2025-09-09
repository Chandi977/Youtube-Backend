// workers/syncLikes.js
import {
  redisSMembers,
  redisGet,
  redisSRem,
  isRedisEnabled,
} from '../utils/upstash.js';
import { Video } from '../models/video.model.js';
import logger from '../utils/logger.js';
// import fetch from 'node-fetch';

export async function syncLikes() {
  if (!isRedisEnabled) return logger.warn('Redis not enabled. Skipping like sync.');

  try {
    const dirtyVideos = await redisSMembers('videos:dirty');

    // Prevent crash if Redis returns null
    if (!Array.isArray(dirtyVideos) || dirtyVideos.length === 0) {
      return logger.info('No videos to sync.');
    }

    for (const videoId of dirtyVideos) {
      const count = await redisGet(`video:${videoId}:likes`);
      if (count !== null) {
        await Video.findByIdAndUpdate(videoId, { likesCount: Number(count) });
        logger.info(`Synced video ${videoId} with ${count} likes.`);
      }
      await redisSRem('videos:dirty', videoId);
    }
  } catch (err) {
    logger.error('syncLikes worker failed', { error: err.message });
  }
}

