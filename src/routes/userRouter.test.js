const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

describe('userRouter', () => {
  let dinerUser;
  let adminUser;
  // Create separate agents for each user to manage their cookies independently
  const dinerAgent = request.agent(app);
  const adminAgent = request.agent(app);

  // Set a longer timeout for debugging if needed
  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // Arrange: Create and log in a regular diner and an admin user for the tests
    dinerUser = {
      name: 'Test Diner',
      email: `diner-${Date.now()}@test.com`,
      password: 'password123',
    };
    // Register the diner user; dinerAgent will now be authenticated
    const registerRes = await dinerAgent.post('/api/auth').send(dinerUser);
    // Store the full user object from the response to get the ID
    dinerUser = registerRes.body.user;

    adminUser = {
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      roles: [{ role: Role.Admin }],
    };
    // Create admin directly in the DB
    await DB.addUser(adminUser);
    // Log the admin in; adminAgent will now be authenticated
    const loginRes = await adminAgent.put('/api/auth').send(adminUser);
    adminUser = loginRes.body.user;
  });

  afterAll(async () => {
    // Teardown: Clean up the created users from the database
    await DB.deleteUser(dinerUser.email);
    await DB.deleteUser(adminUser.email);
  });

  describe('GET /api/user/me', () => {
    it('should return 401 Unauthorized if not authenticated', async () => {
      // Act: Use the base 'request' which has no cookies
      const res = await request(app).get('/api/user/me');

      // Assert
      expect(res.status).toBe(401);
    });

    it('should return the authenticated user data', async () => {
      // Act: Use the authenticated dinerAgent
      const res = await dinerAgent.get('/api/user/me');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dinerUser.id);
      expect(res.body.email).toBe(dinerUser.email);
      expect(res.body.roles).toEqual([{ role: 'diner' }]);
    });
  });

  describe('PUT /api/user/:userId', () => {
    const updatePayload = { name: 'Updated Name' };

    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await request(app).put(`/api/user/${dinerUser.id}`).send(updatePayload);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if a user tries to update another user profile', async () => {
      // Diner tries to update admin using the dinerAgent
      const res = await dinerAgent
        .put(`/api/user/${adminUser.id}`)
        .send(updatePayload);

      expect(res.status).toBe(403);
    });

    it('should allow a user to update their own profile', async () => {
      // Diner updates self using the dinerAgent
      const res = await dinerAgent
        .put(`/api/user/${dinerUser.id}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.email).toBe(dinerUser.email); // Email should be unchanged
      // NOTE: We no longer check for a token in the response body
    });

    it('should allow an admin to update another user profile', async () => {
      const adminUpdatePayload = { name: 'Admin Updated This Name' };

      // Admin updates diner using the adminAgent
      const res = await adminAgent
        .put(`/api/user/${dinerUser.id}`)
        .send(adminUpdatePayload);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Admin Updated This Name');
    });
  });

describe('GET /api/user', () => {
    it('should return 401 Unauthorized if not authenticated', async () => {
      // Act: Use the base 'request' which has no cookies
      const res = await request(app).get('/api/user');

      // Assert
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden for non-admin users', async () => {
      // Act: Use the authenticated dinerAgent who is not an admin
      const res = await dinerAgent.get('/api/user');

      // Assert
      expect(res.status).toBe(403);
    });

    it('should return a list of users for an admin', async () => {
      // Act: Use the authenticated adminAgent
      const res = await adminAgent.get('/api/user');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      // The list should contain at least the admin and diner created in beforeAll
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle pagination with the "limit" parameter', async () => {
      // Act: Request only one user
      const res = await adminAgent.get('/api/user?limit=1');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBe(1);
    });

it('should filter users by name and find the correct user', async () => {
  // Act: Search for the admin user by name
  const res = await adminAgent.get(`/api/user?name=${adminUser.name}`);

  // Assert
  expect(res.status).toBe(200);

  // Find the specific user we created within the array of results
  const foundUser = res.body.users.find(user => user.email === adminUser.email);

  // Assert that our specific user was actually found
  expect(foundUser).toBeDefined();

  // If needed, you can add more assertions about the found user
  expect(foundUser.name).toBe(adminUser.name);
});
  });

});