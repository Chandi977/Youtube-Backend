import { videoQueue } from '../queues/videoQueue.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';

export const getJobStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const job = await videoQueue.getJob(jobId);

  if (!job) {
    throw new ApiError(404, 'Job not found');
  }

  const state = await job.getState();
  const progress = job.progress || 0;
  const data = job.data;
  const result = job.returnvalue;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        jobId: job.id,
        state,
        progress,
        data: {
          title: data.videoData?.title,
          userId: data.userId,
        },
        result: result || null,
        createdAt: new Date(job.timestamp),
      },
      'Job status retrieved successfully'
    )
  );
});
