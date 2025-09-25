// workers/syncLikes.js
import {
  redisSMembers,
  redisGet,
  redisSRem,
  redisSet,
  isRedisEnabled,
} from '../utils/upstash.js';
import { Video } from '../models/video.model.js';
import { Comment } from '../models/comment.model.js';
import { Tweet } from '../models/tweet.model.js';
import { Like } from '../models/like.model.js';
import logger from '../utils/logger.js';

/**
 * Sync likes from Redis to MongoDB
 * Supports videos, comments, tweets
 * Updates liked videos cache for users
 */
export async function syncLikes(batchSize = 100) {
  if (!isRedisEnabled) {
    return logger.warn('Redis not enabled. Skipping like sync.');
  }

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
        const updates = [];

        for (const id of batchIds) {
          const count = await redisGet(`${redisPrefix}:${id}:likes`);
          if (count === null) continue;

          updates.push({
            updateOne: {
              filter: { _id: id },
              update: { likesCount: Number(count) },
            },
          });

          // Remove processed ID from dirty set
          await redisSRem(dirtySet, id);
        }

        if (updates.length > 0) {
          await model.bulkWrite(updates, { ordered: false });
          logger.info(`Synced batch of ${updates.length} ${name}s.`);
        }
      }

      // Refresh cached liked videos if syncing videos
      if (name === 'video') {
        const allUsers = await Like.distinct('likedBy', {
          video: { $ne: null },
        });
        for (const userId of allUsers) {
          const likedVideoIds =
            (await redisSMembers(`user:${userId}:likedVideos`)) || [];
          if (likedVideoIds.length === 0) continue;

          const likes = await Like.find({
            likedBy: userId,
            video: { $in: likedVideoIds },
          })
            .populate({
              path: 'video',
              populate: { path: 'owner', select: 'username fullName avatar' },
            })
            .lean();

          const likedVideos = likes
            .filter((like) => like.video && like.video.owner)
            .map((like) => ({ video: like.video, channel: like.video.owner }));

          await redisSet(
            `${cacheKeyPrefix}${userId}${cacheDataSuffix}`,
            JSON.stringify(likedVideos),
            300
          );
          logger.info(`Refreshed likedVideos cache for user ${userId}`);
        }
      }
    } catch (err) {
      logger.error(`syncLikes failed for ${name}s`, { error: err.message });
    }
  }
}
