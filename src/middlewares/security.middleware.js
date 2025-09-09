import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    statusCode: 429,
    data: {},
    message: 'Too many requests from this IP, please try again later',
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/v1/healthcheck', // Skip health check
});

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  message: {
    statusCode: 429,
    data: {},
    message: 'Too many authentication attempts, please try again later',
    success: false,
  },
  skipSuccessfulRequests: true,
});

// Upload rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: {
    statusCode: 429,
    data: {},
    message: 'Upload limit exceeded, please try again later',
    success: false,
  },
});

// Security middlewares collection
export const securityMiddleware = {
  // Helmet for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        mediaSrc: ["'self'", 'https://res.cloudinary.com'],
        connectSrc: ["'self'", 'https://api.cloudinary.com'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),

  // Rate limiters
  apiLimiter,
  authLimiter,
  uploadLimiter,

  // Data sanitization
  mongoSanitize: mongoSanitize(),
  xss: xss(),
  hpp: hpp({
    whitelist: ['sort', 'fields', 'page', 'limit'], // Allow safe params
  }),
};
