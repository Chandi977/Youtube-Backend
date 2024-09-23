
# Express Router - Comprehensive Study Guide

This guide provides a detailed explanation of the usage of `Express.Router`, HTTP methods, and middleware in an Express.js application. It also expands on additional methods and components that are part of `Router` and can be used for building robust web applications.

## Section 1: Code Overview

Below is a sample code where we create a modular router in Express to handle user-related routes.

```javascript
import { Router } from 'express';
import {
  loginUser,
  registerUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAcccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
} from '../controllers/user.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// User Registration (with avatar and cover image upload)
router.route('/register').post(
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]),
  registerUser
);

// User Login
router.route('/login').post(loginUser);

// User Logout (with JWT verification)
router.route('/logout').post(verifyJWT, logoutUser);

// Token Refresh
router.route('/refresh-token').post(refreshAccessToken);

// Change Password (JWT required)
router.route('/changePassword').post(verifyJWT, changeCurrentPassword);

// Get Current User (JWT required)
router.route('/current-user').get(verifyJWT, getCurrentUser);

// Update Account Details (JWT required)
router.route('/update-account').post(verifyJWT, updateAcccountDetails);

// Update Avatar (JWT required, File upload required)
router.route('/update-avatar').patch(verifyJWT, upload.single('avatar'), updateUserAvatar);

// Update Cover Image (JWT required, File upload required)
router.route('/update-coverImage').patch(verifyJWT, upload.single('coverImage'), updateUserCoverImage);

export default router;
```

## Section 2: HTTP Methods

Express supports the following HTTP methods. They represent different types of actions a user can take when interacting with the server.

- **GET**: Retrieve data from the server.
  - Example: `router.route('/users').get(getAllUsers);`
  
- **POST**: Send data to the server, often to create new resources.
  - Example: `router.route('/register').post(registerUser);`
  
- **PATCH**: Partially update an existing resource.
  - Example: `router.route('/update-avatar').patch(updateAvatar);`
  
- **PUT**: Replace an existing resource with a new one.
  - Example: `router.route('/update-user').put(updateUser);`

- **DELETE**: Remove a resource from the server.
  - Example: `router.route('/user/:id').delete(deleteUser);`

## Section 3: Router

### What is a Router?

A `Router` in Express is a mini-instance of an application that can be used to group related route handlers together. You can attach middleware, define route-specific logic, and export the router to use in your main application.

```javascript
const router = Router();
router.route('/some-route').get(handlerFunction);
```

### Common Router Methods

1. **Router-Level Middleware**:
   - Middleware applied specifically to a router instance.
   - Example: `router.use(middlewareFunction);`
   
2. **Route Chaining**:
   - Chain different HTTP methods for a single route.
   - Example:
     ```javascript
     router.route('/user/:id')
       .get(getUserById)
       .put(updateUser)
       .delete(deleteUser);
     ```
   
3. **Parameterized Routes**:
   - Define routes that accept parameters (like IDs).
   - Example:
     ```javascript
     router.route('/user/:id').get((req, res) => {
       const userId = req.params.id;
       // Logic to handle user by ID
     });
     ```

## Section 4: Middleware

Middleware in Express can be categorized as:

1. **Application-Level Middleware**:
   - Applied to the entire application.
   - Example:
     ```javascript
     app.use(middlewareFunction);
     ```

2. **Router-Level Middleware**:
   - Applied specifically to a router instance.
   - Example:
     ```javascript
     router.use(middlewareFunction);
     ```

3. **Error-Handling Middleware**:
   - Handles errors in the application.
   - Example:
     ```javascript
     app.use((err, req, res, next) => {
       res.status(500).send('Something went wrong!');
     });
     ```

## Section 5: Advanced Router Concepts

1. **Nested Routers**:
   - You can nest routers to make your routing more modular.
   - Example:
     ```javascript
     const userRouter = require('./user.router');
     const adminRouter = require('./admin.router');
     app.use('/users', userRouter);
     app.use('/admin', adminRouter);
     ```

2. **Combining Static and Dynamic Routes**:
   - You can define both static and dynamic routes.
   - Example:
     ```javascript
     router.route('/product').get(getAllProducts);
     router.route('/product/:id').get(getProductById);
     ```

3. **Handling Query Parameters**:
   - Express supports handling query strings like `/search?query=abc`.
   - Example:
     ```javascript
     router.route('/search').get((req, res) => {
       const query = req.query.query;
       res.send(`You searched for: ${query}`);
     });
     ```

## Section 6: Best Practices for Routers

1. **Organize your routes by domain**: Use multiple routers for different parts of your application (e.g., UserRouter, AdminRouter).
2. **Apply middleware at appropriate levels**: Use middleware where necessary (e.g., authentication middleware should be used on protected routes only).
3. **Leverage route chaining**: Group related routes under one route using `.route()` and chain different HTTP methods.

## Learning Resources for Further Study:

- [Express Router Documentation](https://expressjs.com/en/guide/routing.html)
- [Multer Documentation for File Uploads](https://www.npmjs.com/package/multer)
- [JWT Authentication in Express](https://jwt.io/)
