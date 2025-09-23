import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { LiveStream } from '../models/liveStream.model.js';
import { StreamViewer } from '../models/liveViews.model.js';
import { LiveComment } from '../models/liveComment.model.js';
import logger from '../utils/logger.js';

// Rate limiting for real-time actions
const rateLimiters = new Map();

const createRateLimit = (userId, action, maxRequests = 5, windowMs = 60000) => {
  const key = `${userId}-${action}`;
  const now = Date.now();

  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  const limiter = rateLimiters.get(key);

  if (now > limiter.resetTime) {
    limiter.count = 1;
    limiter.resetTime = now + windowMs;
    return true;
  }

  if (limiter.count >= maxRequests) {
    return false;
  }

  limiter.count++;
  return true;
};

// Socket authentication middleware
const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('No token provided'));
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken._id).select(
      '-password -refreshToken'
    );

    if (!user) {
      return next(new Error('Invalid token'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

export const initializeSocket = (server) => {
  // Define a base set of allowed origins, including localhost and all Vercel domains.
  const baseAllowedOrigins = [
    'http://localhost:5173', // Local development frontend
    /\.vercel\.app$/, // Matches any Vercel deployment URL
  ];
  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : [];
  const allowedOrigins = [...new Set([...baseAllowedOrigins, ...envOrigins])];

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    logger.info(
      `User ${socket.user.username} connected with socket ID: ${socket.id}`
    );

    // Join a room based on user ID for private notifications
    socket.join(socket.user._id.toString());

    // Join stream room
    socket.on('join-stream', async (data) => {
      try {
        const { streamId, device = 'desktop', quality = '720p' } = data;

        if (!streamId) {
          socket.emit('error', { message: 'Stream ID is required' });
          return;
        }

        // Validate stream
        const liveStream = await LiveStream.findById(streamId);
        if (!liveStream) {
          socket.emit('error', { message: 'Stream not found' });
          return;
        }

        if (!liveStream.isLive) {
          socket.emit('error', { message: 'Stream is not currently live' });
          return;
        }

        // Join socket room
        socket.join(streamId);
        socket.currentStream = streamId;

        // Update or create viewer record
        const existingViewer = await StreamViewer.findOne({
          liveStream: streamId,
          user: socket.user._id,
          isActive: true,
        });

        if (existingViewer) {
          existingViewer.socketId = socket.id;
          existingViewer.device = device;
          existingViewer.quality = quality;
          existingViewer.lastSeen = new Date();
          await existingViewer.save();
        } else {
          await StreamViewer.create({
            liveStream: streamId,
            user: socket.user._id,
            socketId: socket.id,
            device,
            quality,
          });

          // Increment concurrent viewers
          await liveStream.addViewer();
        }

        // Get current viewer count
        const viewerCount = await StreamViewer.getViewerCount(streamId);

        // Emit to all viewers in the stream
        socket.to(streamId).emit('viewer-joined', {
          user: {
            id: socket.user._id,
            username: socket.user.username,
            avatar: socket.user.avatar,
          },
          viewerCount,
        });

        // Send current stream data to the joining user
        socket.emit('stream-joined', {
          streamId,
          viewerCount,
          isLive: liveStream.isLive,
        });

        logger.info(`User ${socket.user.username} joined stream ${streamId}`);
      } catch (error) {
        logger.error('Error joining stream:', error);
        socket.emit('error', { message: 'Failed to join stream' });
      }
    });

    // Leave stream room
    socket.on('leave-stream', async (data) => {
      try {
        const { streamId } = data;

        if (socket.currentStream && socket.currentStream === streamId) {
          socket.leave(streamId);
          socket.currentStream = null;

          // Update viewer record
          const viewer = await StreamViewer.findOne({
            liveStream: streamId,
            user: socket.user._id,
            isActive: true,
          });

          if (viewer) {
            await viewer.leave();

            // Decrement viewer count
            const liveStream = await LiveStream.findById(streamId);
            if (liveStream) {
              await liveStream.removeViewer();

              const viewerCount = await StreamViewer.getViewerCount(streamId);

              socket.to(streamId).emit('viewer-left', {
                userId: socket.user._id,
                viewerCount,
              });
            }
          }

          logger.info(`User ${socket.user.username} left stream ${streamId}`);
        }
      } catch (error) {
        logger.error('Error leaving stream:', error);
      }
    });

    // Real-time comment
    socket.on('send-comment', async (data) => {
      try {
        const {
          streamId,
          content,
          type = 'regular',
          superChatAmount = 0,
        } = data;

        // Rate limiting
        if (!createRateLimit(socket.user._id, 'comment', 10, 60000)) {
          socket.emit('error', {
            message: 'Rate limit exceeded. Please slow down.',
          });
          return;
        }

        if (!content?.trim()) {
          socket.emit('error', { message: 'Comment content is required' });
          return;
        }

        if (content.length > 500) {
          socket.emit('error', {
            message: 'Comment is too long (max 500 characters)',
          });
          return;
        }

        // Validate stream and user permissions
        const liveStream = await LiveStream.findById(streamId);
        if (!liveStream || !liveStream.isLive || !liveStream.chatEnabled) {
          socket.emit('error', {
            message: 'Cannot send comment to this stream',
          });
          return;
        }

        // Check if user is banned
        const isBanned = liveStream.bannedUsers.some((ban) =>
          ban.user.equals(socket.user._id)
        );
        if (isBanned) {
          socket.emit('error', { message: 'You are banned from this stream' });
          return;
        }

        // Check if user is viewing the stream
        const viewer = await StreamViewer.findOne({
          liveStream: streamId,
          user: socket.user._id,
          isActive: true,
        });

        if (!viewer) {
          socket.emit('error', {
            message: 'You must be watching the stream to comment',
          });
          return;
        }

        // Calculate stream timestamp
        const streamTimestamp = liveStream.startTime
          ? Math.floor((new Date() - liveStream.startTime) / 1000)
          : 0;

        // Create comment
        const comment = await LiveComment.create({
          content: content.trim(),
          liveStream: streamId,
          owner: socket.user._id,
          type,
          superChatAmount: type === 'superchat' ? superChatAmount : 0,
          streamTimestamp,
          isHighlighted: type === 'superchat' || superChatAmount > 100,
        });

        await comment.populate('owner', 'username fullName avatar');

        // Update stats
        await Promise.all([
          LiveStream.findByIdAndUpdate(streamId, {
            $inc: { 'streamStats.totalMessages': 1 },
          }),
          viewer.incrementEngagement('messagesCount'),
        ]);

        // Emit to all stream viewers
        io.to(streamId).emit('new-comment', {
          comment: comment.toObject(),
          streamId,
          timestamp: new Date(),
        });

        // Special handling for super chats
        if (type === 'superchat') {
          io.to(streamId).emit('super-chat', {
            comment: comment.toObject(),
            amount: superChatAmount,
            streamId,
          });

          await viewer.incrementEngagement('superChatsAmount', superChatAmount);
        }

        socket.emit('comment-sent', { commentId: comment._id });
      } catch (error) {
        logger.error('Error sending comment:', error);
        socket.emit('error', { message: 'Failed to send comment' });
      }
    });

    // Real-time like
    socket.on('toggle-like', async (data) => {
      try {
        const { commentId, streamId } = data;

        if (!commentId || !streamId) {
          socket.emit('error', {
            message: 'Comment ID and Stream ID are required',
          });
          return;
        }

        // Rate limiting
        if (!createRateLimit(socket.user._id, 'like', 30, 60000)) {
          socket.emit('error', { message: 'Rate limit exceeded for likes' });
          return;
        }

        const comment = await LiveComment.findById(commentId);
        if (!comment) {
          socket.emit('error', { message: 'Comment not found' });
          return;
        }

        const isLiked = comment.likes.includes(socket.user._id);
        let updatedComment;

        if (isLiked) {
          updatedComment = await comment.removeLike(socket.user._id);
        } else {
          updatedComment = await comment.addLike(socket.user._id);

          // Update viewer engagement
          const viewer = await StreamViewer.findOne({
            liveStream: streamId,
            user: socket.user._id,
            isActive: true,
          });
          if (viewer) {
            await viewer.incrementEngagement('likesGiven');
          }
        }

        // Emit to all stream viewers
        io.to(streamId).emit('comment-like-update', {
          commentId,
          likesCount: updatedComment.likesCount,
          isLiked: !isLiked,
          userId: socket.user._id,
        });
      } catch (error) {
        logger.error('Error toggling like:', error);
        socket.emit('error', { message: 'Failed to toggle like' });
      }
    });

    // Stream quality change
    socket.on('change-quality', async (data) => {
      try {
        const { streamId, quality } = data;

        if (!streamId || !quality) {
          return;
        }

        const viewer = await StreamViewer.findOne({
          liveStream: streamId,
          user: socket.user._id,
          isActive: true,
        });

        if (viewer) {
          viewer.quality = quality;
          viewer.lastSeen = new Date();
          await viewer.save();
        }
      } catch (error) {
        logger.error('Error changing quality:', error);
      }
    });

    // Heartbeat to track active viewers
    socket.on('heartbeat', async (data) => {
      try {
        const { streamId } = data;

        const viewer = await StreamViewer.findOne({
          socketId: socket.id,
          isActive: true,
        });

        if (viewer) {
          viewer.lastSeen = new Date();
          await viewer.save();
        }
      } catch (error) {
        logger.error('Error updating heartbeat:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        logger.info(`User ${socket.user.username} disconnected`);

        // Update viewer record
        const viewer = await StreamViewer.findOne({
          socketId: socket.id,
          isActive: true,
        });

        if (viewer) {
          await viewer.leave();

          // Update stream viewer count
          const liveStream = await LiveStream.findById(viewer.liveStream);
          if (liveStream && liveStream.isLive) {
            await liveStream.removeViewer();

            const viewerCount = await StreamViewer.getViewerCount(
              viewer.liveStream
            );

            socket.to(viewer.liveStream.toString()).emit('viewer-left', {
              userId: socket.user._id,
              viewerCount,
            });
          }
        }

        // Clean up rate limiters
        for (const [key] of rateLimiters.entries()) {
          if (key.startsWith(socket.user._id.toString())) {
            rateLimiters.delete(key);
          }
        }
      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    });
  });

  // Clean up inactive rate limiters every 5 minutes
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, limiter] of rateLimiters.entries()) {
        if (now > limiter.resetTime) {
          rateLimiters.delete(key);
        }
      }
    },
    5 * 60 * 1000
  );

  logger.info('Socket.IO server initialized successfully');
  return io;
};
