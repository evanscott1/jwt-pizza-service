const request = require('supertest');
const app = require('../service.js');
const { Role, DB } = require('../database/database.js');

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
  const dinerAgent = request.agent(app);
  const adminAgent = request.agent(app);

  if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5);
  }

  beforeAll(async () => {
    // Create and log in a regular diner user
    dinerUser = {
      name: 'Test Diner',
      email: `diner-${Date.now()}@test.com`,
      password: 'password123',
    };
    await dinerAgent.post('/api/auth').send(dinerUser);

    // Create and log in an admin user
    adminUser = {
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      roles: [{ role: Role.Admin }],
    };
    await DB.addUser(adminUser);
    await adminAgent.put('/api/auth').send(adminUser);
  });

  afterAll(async () => {
    // Clean up created users from the database
    await DB.deleteUser(dinerUser.email);
    await DB.deleteUser(adminUser.email);
  });

  describe('GET /api/order/menu', () => {
    it('should return the full menu', async () => {
      // This endpoint doesn't require auth, so we can use the base request
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

    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await request(app).put('/api/order/menu').send(newMenuItem);
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if user is not an admin', async () => {
      // Use the diner's agent, which is authenticated but not an admin
      const res = await dinerAgent.put('/api/order/menu').send(newMenuItem);
      expect(res.status).toBe(403);
    });

    it('should allow an admin to add a new menu item', async () => {
      // Use the admin's agent
      const res = await adminAgent.put('/api/order/menu').send(newMenuItem);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const addedItem = res.body.find((item) => item.title === newMenuItem.title);
      expect(addedItem).toBeDefined();
    });
  });

  describe('GET /api/order', () => {
    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await request(app).get('/api/order');
      expect(res.status).toBe(401);
    });

    it('should return the orders for the authenticated user', async () => {
      // Use the diner's agent to fetch their orders
      const res = await dinerAgent.get('/api/order');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('orders');
      expect(res.body).toHaveProperty('dinerId');
    });
  });

  describe('POST /api/order', () => {
    const newOrder = {
      franchiseId: 1,
      storeId: 1,
      items: [{ menuId: 1, description: 'Test Item', price: 9.99 }],
    };

    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await request(app).post('/api/order').send(newOrder);
      expect(res.status).toBe(401);
    });

    it('should create a new order for the authenticated user', async () => {
      // Use the diner's agent to create an order
      const res = await dinerAgent.post('/api/order').send(newOrder);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('order');
      expect(res.body.order.id).toBeDefined();
      expect(res.body).toHaveProperty('followLinkToEndChaos', mockFactoryResponse.reportUrl);
      expect(res.body).toHaveProperty('jwt', mockFactoryResponse.jwt);
    });
  });
});