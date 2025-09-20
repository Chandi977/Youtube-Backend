import dotenv from 'dotenv';
import connectDB from './config/index.js';
import { server } from './app.js'; // Import server instead of app
import logger from './utils/logger.js';

// Load environment variables
dotenv.config({
  path: './.env',
});

const PORT = process.env.PORT || 8000;

// Connect to database and start server
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`⚙️ Server is running at port: ${PORT}`);
      logger.info(`🚀 Socket.IO server is ready for real-time connections`);
      logger.info(`🎥 Live streaming feature is now available`);
    });

    server.on('error', (error) => {
      logger.error('❌ Server connection error:', error);
      throw error;
    });
  })
  .catch((error) => {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('👋 SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('✅ Process terminated');
    process.exit(0);
  });
});

// Below is a commented-out example of a more basic setup for MongoDB and Express
/*
import express from "express";
import mongoose from "mongoose";
import { DB_NAME } from "./constants.js"; // Assuming DB_NAME is exported from constants.js

const app = express();
async () => {
  try {
    // Connect to MongoDB using Mongoose
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    // Handle any errors that occur during connection
    app.on("error", (error) => {
      console.log("Error :", error);
      throw error;
    });
  } catch (error) {
    // Log an error message if the connection to MongoDB fails
    console.error("ERROR :", error);
    throw error;
  }
};
*/
