// workers/syncLikes.js
import {
  redisSMembers,
  redisSet,
  isRedisEnabled,
  redisMGet,
  redisSRem
} from '../utils/upstash.js';
import { Video } from '../models/video.model.js';
import { Comment } from '../models/comment.model.js';
import { Tweet } from '../models/tweet.model.js';
import { Like } from '../models/like.model.js';
import logger from '../utils/logger.js';

/**
 * Helper to execute Redis pipeline commands.
 * This is a simplified local version. For a more robust solution, this could be in upstash.js
 * For this fix, we will use Promise.all with individual commands which is still a huge improvement.
 * Sync likes from Redis to MongoDB
 * Supports videos, comments, tweets
 * Updates liked videos cache for users
 */
export async function syncLikes(batchSize = 100) {
  const jobStartTime = Date.now();
  logger.info('Starting background job: syncLikes');

  if (!isRedisEnabled) {
    return logger.warn('Redis not enabled. Skipping like sync.');
  }

  // Configuration for different entity types that can be liked
  const entities = [
    {
      name: 'video',
      model: Video,
      dirtySet: 'videos:dirty',
      redisPrefix: 'video',
      cacheKeyPrefix: 'user:',
      cacheDataSuffix: ':likedVideos:data',
    },
    {
      name: 'comment',
      model: Comment,
      dirtySet: 'comments:dirty',
      redisPrefix: 'comment',
    },
    {
      name: 'tweet',
      model: Tweet,
      dirtySet: 'tweets:dirty',
      redisPrefix: 'tweet',
    },
  ];

  for (const {
    name,
    model,
    dirtySet,
    redisPrefix,
    cacheKeyPrefix,
    cacheDataSuffix,
  } of entities) {
    try {
      const dirtyIds = await redisSMembers(dirtySet);
      if (!Array.isArray(dirtyIds) || dirtyIds.length === 0) {
        logger.info(`No ${name}s to sync.`);
        continue;
      }

      logger.info(`Found ${dirtyIds.length} dirty ${name}s to sync.`);

      // Process in batches to avoid huge MongoDB bulkWrite
      for (let i = 0; i < dirtyIds.length; i += batchSize) {
        const batchIds = dirtyIds.slice(i, i + batchSize);
        const likeCountKeys = batchIds.map(
          (id) => `${redisPrefix}:${id}:likes`
        );

        // Batch get all like counts
        const counts = await redisMGet(likeCountKeys);

        const updates = counts
          .map((count, index) => {
            if (count === null) return null;
            return {
              updateOne: {
                filter: { _id: batchIds[index] },
                update: { likesCount: Number(count) },
              },
            };
          })
          .filter(Boolean); // Remove null entries

        if (updates.length > 0) {
          await model.bulkWrite(updates, { ordered: false });
          logger.info(`Synced batch of ${updates.length} ${name}s.`);
          // Atomically remove all processed IDs from the dirty set
          await redisSRem(dirtySet, ...batchIds);
        }
      }

      // Refresh cached liked videos if syncing videos
      if (name === 'video') {
        const allUsers = await Like.distinct('likedBy', {
          video: { $ne: null },
        });

        if (!allUsers.length) continue;

        logger.info(
          `Refreshing liked videos cache for ${allUsers.length} users.`
        );

        for (const userId of allUsers) {
          const likedVideoIds = await redisSMembers(
            `user:${userId}:likedVideos`
          );
          if (likedVideoIds.length === 0) continue;

          const likes = await Like.find({
            likedBy: userId,
            video: { $in: likedVideoIds },
          })
            .populate({
              path: 'video',
              populate: { path: 'owner', select: 'username fullName avatar' }, // Ensure owner is populated
            })
            .lean();

          const likedVideos = likes
            .filter((like) => like.video && like.video.owner) // Filter out any potential nulls
            .map((like) => ({ video: like.video, channel: like.video.owner }));

          await redisSet(
            `${cacheKeyPrefix}${userId}${cacheDataSuffix}`,
            likedVideos, // redisSet will stringify it
            300
          );
          logger.info(`Refreshed likedVideos cache for user ${userId}`);
        }
      }
    } catch (err) {
      logger.error(`syncLikes failed for ${name}s`, { error: err.message });
    }
  }

  const jobEndTime = Date.now();
  logger.info(
    `Finished background job: syncLikes in ${jobEndTime - jobStartTime}ms`
  );
}
