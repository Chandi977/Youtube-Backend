import mongoose, { Schema } from 'mongoose'; // Importing mongoose and Schema from mongoose to define the schema.
import jwt from 'jsonwebtoken'; // Importing jsonwebtoken for generating JWT tokens.
import bcrypt from 'bcrypt'; // Importing bcrypt for hashing passwords.

// Defining the schema for the User model
const userSchema = new Schema(
  {
    username: {
      type: String, // Field type is String
      required: true, // This field is required
      unique: true, // This field must be unique across documents
      lowercase: true, // Convert to lowercase
      trim: true, // Remove leading and trailing spaces
      index: true, // Create an index for this field
    },
    email: {
      type: String, // Field type is String
      required: true, // This field is required
      unique: true, // This field must be unique across documents
      lowercase: true, // Convert to lowercase
      trim: true, // Remove leading and trailing spaces
    },
    fullName: {
      type: String, // Field type is String
      required: true, // This field is required
      trim: true, // Remove leading and trailing spaces
      index: true, // Create an index for this field
    },
    avatar: {
      type: String, // Field type is String, storing the Cloudinary URL
      required: true, // This field is required
    },
    coverImage: {
      type: String, // Field type is String, optional field for storing Cloudinary URL
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId, // Field type is ObjectId for referencing Video documents
        ref: 'Video', // Reference to the Video model
      },
    ],
    password: {
      type: String, // Field type is String
      // Password is not required for OAuth users
    },
    refreshToken: {
      type: String, // Field type is String for storing refresh token
    },
    oauthProvider: {
      type: String,
      enum: ['google', 'github', 'local'],
      default: 'local',
    },
    oauthId: {
      type: String,
      unique: true,
      sparse: true, // a sparse index doesn't index documents that have a null value for the field
    },
  },
  { timestamps: true } // Adding timestamps (createdAt and updatedAt) to the schema
);

// Middleware to hash the password before saving the user document
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Proceed if password is not modified

  this.password = await bcrypt.hash(this.password, 10); // Hash the password with a salt rounds of 10
  next(); // Proceed to the next middleware or save the document
});

// Method to compare a provided password with the hashed password stored in the database
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password); // Compare provided password with stored hashed password
};

// Method to generate a JWT access token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id, // Include user ID in the token payload
      email: this.email, // Include email in the token payload
      username: this.username, // Include username in the token payload
      fullname: this.fullName, // Include fullName in the token payload
    },
    process.env.ACCESS_TOKEN_SECRET, // Secret key from environment variables
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY, // Token expiration time from environment variables
    }
  );
};

// Method to generate a JWT refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id, // Include user ID in the token payload
    },
    process.env.REFRESH_TOKEN_SECRET, // Secret key from environment variables
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY, // Token expiration time from environment variables
    }
  );
};

// Exporting the User model based on the userSchema
export const User = mongoose.model('User', userSchema);
