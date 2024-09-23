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

    // Aggregate pipeline se comments fetch kar rahe hain
    const pipeline = [
      {
        $match: {
          video: mongoose.Types.ObjectId(videoId), // Video ke ID ke sath match karo
        },
      },
      {
        $sort: {
          createdAt: -1, // Naye comments pehle aayenge
        },
      },
      {
        $skip: (page - 1) * limit, // Pagination ke liye skip karo
      },
      {
        $limit: parseInt(limit), // Limit set karo
      },
      {
        $lookup: {
          from: 'users', // 'users' collection se data lo
          localField: 'owner', // Owner field ka reference user ke ID se match karo
          foreignField: '_id',
          as: 'userDetails', // User ke details ko userDetails field mein daalo
        },
      },
      {
        $project: {
          _id: 1, // Comment ke fields select karna
          text: 1,
          createdAt: 1,
          user: {
            _id: '$userDetails._id',
            username: '$userDetails.username',
            avatar: '$userDetails.avatar',
          },
        },
      },
    ];

    const comments = await Comment.aggregate(pipeline); // Aggregate query se comments fetch karo
    if (!comments.length) {
      throw new ApiError(404, 'No comments found for this video'); // Agar comments nahi hai to error throw karo
    }
    return res
      .status(200) // 200 status code se success response
      .json(new ApiResponse(200, comments, 'Comments successfully fetched.'));
  } catch (error) {
    console.error('Error aya hai getVideoComments pe :', error);
    return res
      .status(500)
      .json(new ApiResponse(500, error, 'Kuch to gadbad hai server mai'));
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

    await comment.remove(); // Comment delete karo

    return res
      .status(200)
      .json(new ApiResponse(200, null, 'Comment deleted successfully.'));
  } catch (error) {
    console.error('Dekho kuch to Server mai glti hai:', error);
    return res.status(500).json(new ApiResponse(500, error, 'Server fata'));
  }
});

export { getVideoComments, addComment, updateComment, deleteComment };
