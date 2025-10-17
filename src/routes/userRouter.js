const express = require('express');
const { asyncHandler } = require('../endpointHelper.js');
const { DB, Role } = require('../database/database.js');
const { authRouter, setAuth } = require('./authRouter.js');

const userRouter = express.Router();

userRouter.docs = [
  {
    method: 'GET',
    path: '/api/user/me',
    requiresAuth: true,
    description: 'Get authenticated user. The auth cookie must be sent with the request.',
    example: `curl -X GET localhost:3000/api/user/me`,
    response: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
  },
  {
    method: 'PUT',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Update user. A new auth cookie is set upon successful update.',
    example: `curl -X PUT localhost:3000/api/user/1 -d '{"name":"常用名字", "email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
    response: { user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] } },
  },
  {
    method: 'GET',
    path: '/api/user?page=1&limit=10&name=*',
    requiresAuth: true,
    description: 'Gets a list of users. The auth cookie must be sent with the request.',
    example: `curl -X GET "localhost:3000/api/user?page=1&limit=10&name=*"`,
    response: {
      users: [
        {
          id: 1,
          name: '常用名字',
          email: 'a@jwt.com',
          roles: [{ role: 'admin' }],
        },
      ],
    },
  },
  {
    method: 'DELETE',
    path: '/api/user/:userId',
    requiresAuth: true,
    description: 'Delete a user by their ID. Requires Admin role.',
    example: `curl -X DELETE localhost:3000/api/user/123`,
    response: { message: 'user deleted' },
  },
];

// getUser
userRouter.get(
  '/me',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

// updateUser
userRouter.put(
  '/:userId',
  authRouter.authenticateToken,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const userId = Number(req.params.userId);
    const user = req.user;
    if (user.id !== userId && !user.isRole(Role.Admin)) {
      return res.status(403).json({ message: 'unauthorized' });
    }

    const updatedUser = await DB.updateUser(userId, name, email, password);
    const auth = await setAuth(updatedUser); //Why do we do this?
    res.json({ user: updatedUser, token: auth });
  })
);

// Gets a list of users (Admin Only)
userRouter.get(
  '/',
  authRouter.authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // 3. Parse query parameters for pagination and filtering
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const name = req.query.name;

    // 4. Fetch users from the database with the provided options
    const users = await DB.getUsers({ page, limit, name });

    // 5. Send the response
    res.json({ users });
  })
);

// DELETE a user by ID (Admin Only)
userRouter.delete(
  '/:userId',
  authRouter.authenticateToken, // 1. Ensure user is logged in
  requireAdmin,                 // 2. Ensure user is an admin
  asyncHandler(async (req, res) => {
    // 3. Get the ID of the user to delete from the URL parameters
    const userIdToDelete = parseInt(req.params.userId);
    
    // 4. Prevent an admin from deleting themselves
    if (userIdToDelete === req.user.id) {
      return res.status(400).json({ message: 'Forbidden: you cannot delete yourself.' });
    }

    // 5. To use the existing DB.deleteUser(email), we first need to find the user by ID to get their email.
    // NOTE: This assumes you have a DB.getUserById function. If not, you'll need to create one.
    const user = await DB.getUserById(userIdToDelete);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 6. Call the database function to delete the user by their email
    await DB.deleteUser(user.email);
    
    // 7. Send success response
    res.status(200).json({ message: 'user deleted' });
  })
);

// Middleware to check for admin role
function requireAdmin(req, res, next) {
  // Assumes setAuthUser middleware has already run and attached req.user
  if (!req.user || !req.user.isRole(Role.Admin)) {
    return res.status(403).send({ message: 'Forbidden: requires admin role' });
  }
  next();
}

module.exports = userRouter;
