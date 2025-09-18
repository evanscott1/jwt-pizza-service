const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

describe('userRouter', () => {
  let dinerUser;
  let adminUser;
  let dinerToken;
  let adminToken;

  // Set a longer timeout for debugging if needed
  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // Arrange: Create a regular diner and an admin user for the tests
    dinerUser = {
      name: 'Test Diner',
      email: `diner-${Date.now()}@test.com`,
      password: 'password123',
    };
    const registerRes = await request(app).post('/api/auth').send(dinerUser);
    dinerToken = registerRes.body.token;
    // Store the full user object from the response, which includes the ID
    dinerUser = registerRes.body.user;

    adminUser = {
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      roles: [{ role: Role.Admin }],
    };
    // Create admin via DB and then log in to get a token
    await DB.addUser(adminUser);
    const loginRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = loginRes.body.token;
    adminUser = loginRes.body.user;
  });

  afterAll(async () => {
    // Teardown: Clean up the created users from the database
    await DB.deleteUser(dinerUser.email);
    await DB.deleteUser(adminUser.email);
  });

  describe('GET /api/user/me', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      // Act
      const res = await request(app).get('/api/user/me');

      // Assert
      expect(res.status).toBe(401);
    });

    it('should return the authenticated user data', async () => {
      // Act
      const res = await request(app)
        .get('/api/user/me')
        .set('Authorization', `Bearer ${dinerToken}`);

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(dinerUser.id);
      expect(res.body.email).toBe(dinerUser.email);
      expect(res.body.roles).toEqual([{ role: 'diner' }]);
    });
  });

  describe('PUT /api/user/:userId', () => {
    const updatePayload = { name: 'Updated Name' };

    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).put(`/api/user/${dinerUser.id}`).send(updatePayload);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if a user tries to update another user profile', async () => {
      const res = await request(app)
        .put(`/api/user/${adminUser.id}`) // Diner tries to update admin
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(updatePayload);

      expect(res.status).toBe(403);
    });

    it('should allow a user to update their own profile', async () => {
      const res = await request(app)
        .put(`/api/user/${dinerUser.id}`) // Diner updates self
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.email).toBe(dinerUser.email); // Email should be unchanged
      expect(res.body.token).toBeDefined(); // Should receive a new token
    });

    it('should allow an admin to update another user profile', async () => {
      const adminUpdatePayload = { name: 'Admin Updated This Name' };

      const res = await request(app)
        .put(`/api/user/${dinerUser.id}`) // Admin updates diner
        .set('Authorization', `Bearer ${adminToken}`)
        .send(adminUpdatePayload);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Admin Updated This Name');
      expect(res.body.token).toBeDefined();
    });
  });
});