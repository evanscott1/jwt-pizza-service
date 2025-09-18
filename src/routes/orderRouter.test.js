const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

// Mock the global fetch function before all tests
const mockFactoryResponse = { reportUrl: 'http://example.com', jwt: 'factory-jwt' };
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockFactoryResponse),
  })
);

describe('orderRouter', () => {
  let dinerUser;
  let adminUser;
  let dinerToken;
  let adminToken;

  // Set a longer timeout for debugging if needed
  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // Create a regular diner user for testing
    dinerUser = {
      name: 'Test Diner',
      email: `diner-${Date.now()}@test.com`,
      password: 'password123',
    };
    let registerRes = await request(app).post('/api/auth').send(dinerUser);
    dinerToken = registerRes.body.token;

    // Create an admin user for testing admin-only routes
    adminUser = {
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      roles: [{ role: Role.Admin }], // This assumes your addUser can handle roles
    };
    // We register the admin via the DB directly if there's no admin registration endpoint
    await DB.addUser(adminUser);
    let loginRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    // Clean up created users from the database
    await DB.deleteUser(dinerUser.email);
    await DB.deleteUser(adminUser.email);
  });

  describe('GET /api/order/menu', () => {
    it('should return the full menu', async () => {
      const res = await request(app).get('/api/order/menu');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PUT /api/order/menu', () => {
    const newMenuItem = {
      title: 'Test Pizza',
      description: 'A pizza for testing',
      image: 'test.png',
      price: 9.99,
    };

    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).put('/api/order/menu').send(newMenuItem);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if user is not an admin', async () => {
      const res = await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(newMenuItem);
      expect(res.status).toBe(403);
    });

    it('should allow an admin to add a new menu item and return the updated menu', async () => {
      const res = await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newMenuItem);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Check that the new item is now in the menu
      const addedItem = res.body.find((item) => item.title === newMenuItem.title);
      expect(addedItem).toBeDefined();
      expect(addedItem.price).toBe(newMenuItem.price);
    });
  });

  describe('GET /api/order', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).get('/api/order');
      expect(res.status).toBe(401);
    });

    it('should return the orders for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('orders');
      expect(res.body).toHaveProperty('dinerId');
    });
  });

  describe('POST /api/order', () => {
    const newOrder = {
      franchiseId: 1, // Assuming these IDs exist in your test DB
      storeId: 1,
      items: [{ menuId: 1, description: 'Test Item', price: 9.99 }],
    };

    it('should return 401 Unauthorized if no token is provided', async () => {
      const res = await request(app).post('/api/order').send(newOrder);
      expect(res.status).toBe(401);
    });

    it('should create a new order for the authenticated user', async () => {
      const res = await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(newOrder);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('order');
      expect(res.body.order.id).toBeDefined();
      expect(res.body).toHaveProperty('followLinkToEndChaos', mockFactoryResponse.reportUrl);
      expect(res.body).toHaveProperty('jwt', mockFactoryResponse.jwt);
    });
  });
});