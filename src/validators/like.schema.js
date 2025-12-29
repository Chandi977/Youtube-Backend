import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const videoLikeParamsSchema = z.object({
  videoId: objectIdSchema,
});

export const commentLikeParamsSchema = z.object({
  commentId: objectIdSchema,
});

export const tweetLikeParamsSchema = z.object({
  tweetId: objectIdSchema,
});
