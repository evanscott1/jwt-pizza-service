const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

// Increase timeout for slow initial DB connection
jest.setTimeout(30000);

describe('franchiseRouter', () => {
  // Store user objects and their cookie strings
  let adminUser, franchiseeUser, dinerUser;
  let adminCookie, franchiseeCookie, dinerCookie;
  let testFranchise;

  beforeAll(async () => {
    // 1. ARRANGE: Create all necessary users
    adminUser = await createUser({ roles: [{ role: Role.Admin }] }, 'admin');
    adminCookie = await loginAndGetCookie(adminUser);

    franchiseeUser = await createUser({}, 'franchisee');
    franchiseeCookie = await loginAndGetCookie(franchiseeUser);

    dinerUser = await createUser({}, 'diner');
    dinerCookie = await loginAndGetCookie(dinerUser);

    // 2. ARRANGE: Create a franchise using the admin user
    const franchisePayload = {
      name: `Test Franchise ${Date.now()}`,
      admins: [{ email: franchiseeUser.email }],
    };
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Cookie', adminCookie)
      .send(franchisePayload);
    testFranchise = franchiseRes.body;
  });

  afterAll(async () => {
    // 3. TEARDOWN: Clean up all created data
    if (testFranchise) {
      await DB.deleteFranchise(testFranchise.id);
    }
    await DB.deleteUser(adminUser.email);
    await DB.deleteUser(franchiseeUser.email);
    await DB.deleteUser(dinerUser.email);
  });

  // 4. Final hook to close DB connection and allow Jest to exit
  afterAll(async () => {
    await DB.close();
  });

  describe('POST /api/franchise', () => {
    it('should return 403 Forbidden for a non-admin user', async () => {
      const res = await request(app)
        .post('/api/franchise')
        .set('Cookie', dinerCookie)
        .send({ name: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('should allow an admin to create a franchise', async () => {
      const payload = { name: `Temp Franchise ${Date.now()}`, admins: [{ email: franchiseeUser.email }] };
      const res = await request(app)
        .post('/api/franchise')
        .set('Cookie', adminCookie)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      await DB.deleteFranchise(res.body.id); // Cleanup
    });
  });

  describe('GET /api/franchise/:userId', () => {
    it('should allow a user to get their own franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${franchiseeUser.id}`)
        .set('Cookie', franchiseeCookie);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(testFranchise.id);
    });
  });

  describe('Franchise and Store modification', () => {
    it('DELETE /franchise/:franchiseId should be protected', async () => {
      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}`)
        .set('Cookie', dinerCookie);
      // NOTE: This now assumes you've added the auth checks to the DELETE endpoint
      expect(res.status).toBe(403);
    });

    it('POST /:franchiseId/store should allow a franchisee to create a store', async () => {
      const payload = { name: 'New Franchisee Store' };
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Cookie', franchiseeCookie)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(payload.name);
      await DB.deleteStore(testFranchise.id, res.body.id);
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
  // addUser returns the full user object, including the ID
  return await DB.addUser(user);
}

// Updated helper to get the cookie string
async function loginAndGetCookie(user) {
  const res = await request(app).put('/api/auth').send(user);
  return res.headers['set-cookie'][0].split(';')[0];
}