import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const addCommentSchema = z.object({
  content: z.string().min(1).max(500),
  video: objectIdSchema,
  parentId: objectIdSchema.optional(),
});

export const updateCommentSchema = z.object({
  updateContent: z.string().min(1).max(500),
});

export const commentIdParamsSchema = z.object({
  commentId: objectIdSchema,
});

export const videoIdParamsSchema = z.object({
  videoId: objectIdSchema,
});
