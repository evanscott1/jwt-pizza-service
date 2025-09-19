const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

describe('franchiseRouter', () => {
  // User and token variables for authentication
  let adminUser, franchiseeUser, dinerUser;
  let adminToken, franchiseeToken, dinerToken;

  // Store created IDs for testing and cleanup
  let testFranchise;
  let _testStore;

  // Set a longer timeout for debugging
  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // 1. ARRANGE: Create all necessary users for testing different roles
    adminUser = await createUser({ roles: [{ role: Role.Admin }] }, 'admin');
    adminToken = await loginUser(adminUser);

    franchiseeUser = await createUser({}, 'franchisee');
    franchiseeToken = await loginUser(franchiseeUser);

    dinerUser = await createUser({}, 'diner');
    dinerToken = await loginUser(dinerUser);

    // 2. ARRANGE: Create a franchise using the admin user
    const franchisePayload = {
      name: `Test Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(franchisePayload);
    testFranchise = franchiseRes.body;

    // 3. ARRANGE: Create a store using the franchisee user
    const storePayload = { name: 'Test Store' };
    const storeRes = await request(app)
      .post(`/api/franchise/${testFranchise.id}/store`)
      .set('Authorization', `Bearer ${franchiseeToken}`)
      .send(storePayload);
    _testStore = storeRes.body;
  });

  afterAll(async () => {
    // 4. TEARDOWN: Clean up all created data
    if (testFranchise) {
      await DB.deleteFranchise(testFranchise.id);
    }
    await DB.deleteUser(adminUser.email);
    await DB.deleteUser(franchiseeUser.email);
    await DB.deleteUser(dinerUser.email);
  });

  describe('GET /api/franchise', () => {
    it('should list all franchises for a public request', async () => {
      const res = await request(app).get('/api/franchise');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('franchises');
      expect(res.body).toHaveProperty('more');
      expect(res.body.franchises.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/franchise', () => {
    it('should return 403 Forbidden for a non-admin user', async () => {
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send({ name: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('should allow an admin to create a franchise', async () => {
      const payload = {
        name: `Admin Created Franchise ${Date.now()}`,
        admins: [{ email: franchiseeUser.email }],
      };
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      expect(res.body.id).toBeDefined();

      // Cleanup this extra franchise
      await DB.deleteFranchise(res.body.id);
    });
  });

  describe('GET /api/franchise/:userId', () => {
    it('should allow a user to get their own franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${franchiseeUser.id}`)
        .set('Authorization', `Bearer ${franchiseeToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(testFranchise.id);
    });

    it('should allow an admin to get another user\'s franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${franchiseeUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should return an empty array for a user trying to access another user\'s franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${franchiseeUser.id}`)
        .set('Authorization', `Bearer ${dinerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Franchise and Store modification', () => {
    it('DELETE /franchise/:franchiseId should be protected', async () => {
      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}`)
        .set('Authorization', `Bearer ${dinerToken}`);
      expect(res.status).toBe(403);
    });

    it('POST /:franchiseId/store should allow a franchisee to create a store', async () => {
      const payload = { name: 'New Franchisee Store' };
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${franchiseeToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      await DB.deleteStore(testFranchise.id, res.body.id);
    });

    it('DELETE /:franchiseId/store/:storeId should allow a franchisee to delete a store', async () => {
      // Create a temporary store to delete
      const tempStore = await DB.createStore(testFranchise.id, { name: 'To Be Deleted' });

      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}/store/${tempStore.id}`)
        .set('Authorization', `Bearer ${franchiseeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('store deleted');
    });

    it('POST /:franchiseId/store should return 403 for a regular diner', async () => {
      const payload = { name: 'Diner Store Fail' };
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(payload);
      expect(res.status).toBe(403);
    });
  });
});

// Helper functions to keep tests clean
async function createUser(userData, type) {
  const user = {
    name: `Test ${type}`,
    email: `${type}-${Date.now()}@test.com`,
    password: 'password123',
    roles: [{ role: Role.Diner }],
    ...userData,
  };
  return await DB.addUser(user);
}

async function loginUser(user) {
  const res = await request(app).put('/api/auth').send(user);
  return res.body.token;
}