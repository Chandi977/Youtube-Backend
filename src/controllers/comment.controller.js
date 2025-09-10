import mongoose from 'mongoose';
import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Video ke comments ko fetch karne wala function
const getVideoComments = asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    const pipeline = [
      { $match: { video: new mongoose.Types.ObjectId(videoId) } },
      { $sort: { createdAt: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'users',
          localField: 'owner',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      {
        $project: {
          _id: 1,
          content: 1,
          createdAt: 1,
          user: { $arrayElemAt: ['$userDetails', 0] },
        },
      },
    ];

    const comments = await Comment.aggregate(pipeline);

    if (!comments.length) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], 'No comments found for this video'));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, comments, 'Comments successfully fetched.'));
  } catch (error) {
    console.error('Error in getVideoComments:', error);
    return res.status(500).json(new ApiResponse(500, null, 'Server error'));
  }
});

// Naya comment add karne ka function
const addComment = asyncHandler(async (req, res) => {
  try {
    const { content, video, owner } = req.body;

    // Comment create kar rahe hain
    const comment = await Comment.create({
      content,
      video,
      owner,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, comment, 'Comment added successfully.'));
  } catch (error) {
    console.error('Error aya hai add Comment krne pe: ', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error, 'Kuch to gadbad hai server mai.'));
  }
});

// Existing comment ko update karne ka function
const updateComment = asyncHandler(async (req, res) => {
  try {
    const { commentId, updateContent } = req.body;
    console.log(commentId, updateContent, req.body);
    // Comment find karo by ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new ApiError(404, 'Comment not found'); // Agar comment nahi milta to error throw karo
    }

    // Comment ka content update karo
    comment.content = updateContent;
    await comment.save({ validateBeforeSave: false }); // Validation ke bina save karo

    return res
      .status(200)
      .json(new ApiResponse(200, comment, 'Comment updated successfully.'));
  } catch (error) {
    console.error('Error aya hai update comment krne pe: ', error);
    return res.status(500).json(new ApiResponse(500, error, 'Server fata'));
  }
});

// Comment delete karne ka function
const deleteComment = asyncHandler(async (req, res) => {
  try {
    const { commentId } = req.body;
    const userId = req.user._id; // Assuming userId JWT se aa rha hai
    // console.log(userId);
    // Comment find karo by ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new ApiError(404, 'Comment not found'); // Agar comment nahi milta to error throw karo
    }

    // Agar comment ka owner user nahi hai to error throw karo
    if (comment.owner.toString() !== userId.toString()) {
      return res
        .status(403)
        .json(
          new ApiResponse(
            403,
            null,
            'Ap jis comment ko delete krna chate hai woh apka nhi hai'
          )
        );
    }

    await Comment.deleteOne({ _id: commentId }); // Comment delete karo

    return res
      .status(200)
      .json(new ApiResponse(200, null, 'Comment deleted successfully.'));
  } catch (error) {
    console.error('Dekho kuch to Server mai glti hai:', error);
    return res.status(500).json(new ApiResponse(500, error, 'Server fata'));
  }
});

export { getVideoComments, addComment, updateComment, deleteComment };
