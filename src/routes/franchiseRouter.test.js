const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

describe('franchiseRouter', () => {
  // User objects to hold created user data
  let adminUser, franchiseeUser, dinerUser;

  // Create an agent for each user role to manage their own cookies
  const adminAgent = request.agent(app);
  const franchiseeAgent = request.agent(app);
  const dinerAgent = request.agent(app);

  // Store created IDs for testing and cleanup
  let testFranchise;

  // Set a longer timeout for debugging
  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // 1. ARRANGE: Create and log in all necessary users using their respective agents
    adminUser = await createUser({ roles: [{ role: Role.Admin }] }, 'admin');
    await adminAgent.put('/api/auth').send(adminUser);

    franchiseeUser = await createUser({}, 'franchisee');
    await franchiseeAgent.put('/api/auth').send(franchiseeUser);

    dinerUser = await createUser({}, 'diner');
    const dinerLoginRes = await dinerAgent.put('/api/auth').send(dinerUser);
    dinerUser.id = dinerLoginRes.body.user.id; // Ensure we have the diner's ID

    // 2. ARRANGE: Create a franchise using the authenticated adminAgent
    const franchisePayload = {
      name: `Test Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const franchiseRes = await adminAgent.post('/api/franchise').send(franchisePayload);
    testFranchise = franchiseRes.body;

    // 3. ARRANGE: Create a store using the authenticated franchiseeAgent
    const storePayload = { name: 'Test Store' };
    await franchiseeAgent.post(`/api/franchise/${testFranchise.id}/store`).send(storePayload);
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
    });
  });

  describe('POST /api/franchise', () => {
    it('should return 403 Forbidden for a non-admin user', async () => {
      // Use the authenticated dinerAgent
      const res = await dinerAgent.post('/api/franchise').send({ name: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('should allow an admin to create a franchise', async () => {
      const payload = {
        name: `Admin Created Franchise ${Date.now()}`,
        admins: [{ email: franchiseeUser.email }],
      };
      // Use the authenticated adminAgent
      const res = await adminAgent.post('/api/franchise').send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      await DB.deleteFranchise(res.body.id); // Cleanup this extra franchise
    });
  });

  describe('GET /api/franchise/:userId', () => {
    it('should allow a user to get their own franchises', async () => {
      const res = await franchiseeAgent.get(`/api/franchise/${franchiseeUser.id}`);
      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe(testFranchise.id);
    });

    it("should allow an admin to get another user's franchises", async () => {
      const res = await adminAgent.get(`/api/franchise/${franchiseeUser.id}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it("should return an empty array for a user trying to access another's franchises", async () => {
      const res = await dinerAgent.get(`/api/franchise/${franchiseeUser.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Franchise and Store modification', () => {
    it('DELETE /franchise/:franchiseId should be protected', async () => {
      const res = await dinerAgent.delete(`/api/franchise/${testFranchise.id}`);
      expect(res.status).toBe(403);
    });

    it('POST /:franchiseId/store should allow a franchisee to create a store', async () => {
      const payload = { name: 'New Franchisee Store' };
      const res = await franchiseeAgent
        .post(`/api/franchise/${testFranchise.id}/store`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      await DB.deleteStore(testFranchise.id, res.body.id);
    });

    it('DELETE /:franchiseId/store/:storeId should allow a franchisee to delete a store', async () => {
      const tempStore = await DB.createStore(testFranchise.id, { name: 'To Be Deleted' });
      const res = await franchiseeAgent.delete(`/api/franchise/${testFranchise.id}/store/${tempStore.id}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('store deleted');
    });

    it('POST /:franchiseId/store should return 403 for a regular diner', async () => {
      const payload = { name: 'Diner Store Fail' };
      const res = await dinerAgent.post(`/api/franchise/${testFranchise.id}/store`).send(payload);
      expect(res.status).toBe(403);
    });
  });
});

// Helper function to create users in the database
async function createUser(userData, type) {
  const user = {
    name: `Test ${type}`,
    email: `${type}-${Date.now()}@test.com`,
    password: 'password123',
    roles: [{ role: Role.Diner }],
    ...userData,
  };
  // The addUser function should return the created user object, including its ID
  return await DB.addUser(user);
}