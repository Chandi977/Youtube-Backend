import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import connectDB from './config/index.js';
import app from './app.js';

// Catch unexpected errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 8000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running at port : ${PORT}`);
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
