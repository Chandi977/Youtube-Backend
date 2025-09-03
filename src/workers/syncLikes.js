// workers/syncLikes.js
import mongoose from 'mongoose';
import { redisSMembers, redisGet, redisSet } from '../utils/upstash.js';
import { Video } from '../models/video.model.js';

// This function will be triggered periodically
export async function syncLikes() {
  try {
    // 1. Get all videos that have pending like updates
    const dirtyVideos = await redisSMembers('videos:dirty');
    if (!dirtyVideos || dirtyVideos.length === 0) {
      console.log('No Like videos to sync.');
      return;
    }

    console.log(`Syncing ${dirtyVideos.length} videos...`);

    for (const videoId of dirtyVideos) {
      // 2. Get buffered like count from Redis
      const likeKey = `video:${videoId}:likes`;
      const count = await redisGet(likeKey);

      if (count !== null) {
        // 3. Update MongoDB Video.likesCount
        await Video.findByIdAndUpdate(videoId, { likesCount: Number(count) });
        console.log(`✅ Synced video ${videoId} with ${count} likes.`);
      }

      // (Optional) Reset Redis dirty flag
      // Remove the processed videoId from the dirty set
      await redisSRem('videos:dirty', videoId);
    }
  } catch (err) {
    console.error('❌ Error syncing likes:', err.message);
  }
}
