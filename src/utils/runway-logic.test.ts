import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wrapAngle,
  clamp,
  computeRingSlot,
  stepSpring,
  validateCatalog,
  findProductVariant,
  calculateBagTotal,
  parseSavedBagEntries,
  buildShortlistText,
  CatalogData,
  generateTrackingNumber,
  TRACKING_STAGES,
  generateGmailConfirmationContent,
  getPageSeoMetadata
} from './runway-logic';

test('wrapAngle keeps angles in (-PI, PI]', () => {
  assert.equal(wrapAngle(0), 0);
  assert.ok(Math.abs(wrapAngle(Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(2 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-Math.PI) - Math.PI) < 1e-9);
  assert.ok(wrapAngle(Math.PI / 2) > 0);
  assert.ok(wrapAngle(-Math.PI / 2) < 0);
});

test('clamp restricts values to min and max', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('computeRingSlot matches expected slot 0 (front) parameters', () => {
  const W = 1000;
  const H = 800;
  const slot0 = computeRingSlot(0, 0, W, H, 1.08, false);

  assert.equal(slot0.phi, 0);
  assert.equal(slot0.sl, 0);
  assert.equal(slot0.scale, 1.08); // 1.0 * (1 + 0.08)
  assert.equal(slot0.x, 500); // 0.5 * W
  assert.equal(slot0.blur, 0);
  assert.equal(slot0.opacity, 1);
  assert.equal(slot0.zIndex, 1080);
});

test('computeRingSlot generates symmetrical x and positive blur for slot 1 and -1', () => {
  const W = 1000;
  const H = 800;
  const slot1 = computeRingSlot(1, 0, W, H, 1.08, false);
  const slotMinus1 = computeRingSlot(11, 0, W, H, 1.08, false); // index 11 is -1 step

  assert.ok(Math.abs(slot1.sl - 1) < 1e-5);
  assert.ok(Math.abs(slotMinus1.sl - 1) < 1e-5);
  assert.ok(slot1.x > 500);
  assert.ok(slotMinus1.x < 500);
  assert.ok(Math.abs(slot1.x - 500 - (500 - slotMinus1.x)) < 1e-4);
  assert.ok(Math.abs(slot1.scale - slotMinus1.scale) < 1e-4);
  assert.ok(Math.abs(slot1.blur - 1.8) < 1e-4);
  assert.ok(Math.abs(slotMinus1.blur - 1.8) < 1e-4);
});

test('stepSpring critically damps toward target and settles', () => {
  let state = { cur: -1.15, vel: 0, settled: false };
  const target = 0;
  const dt = 1 / 60;

  for (let i = 0; i < 180; i++) {
    state = stepSpring(state.cur, target, state.vel, dt);
    if (state.settled) break;
  }

  assert.equal(state.settled, true);
  assert.equal(state.cur, 0);
  assert.equal(state.vel, 0);
});

test('validateCatalog checks items and variants', () => {
  const validCatalog: CatalogData = {
    source: 'https://nike-makknzjs.myshopify.com/pages/runway',
    looks: [],
    items: [
      {
        id: 'tshirt',
        name: 'Tshirt',
        type: 'Apparel',
        price: 199,
        image: 'https://reel-ref-try-the-look.vercel.app/assets/source-tshirt.webp',
        sizes: ['S', 'M'],
        variants: [
          { id: 101, a: true, o: ['S'] },
          { id: 102, a: true, o: ['M'] }
        ],
        url: 'https://nike-makknzjs.myshopify.com/products/tshirt'
      }
    ]
  };

  assert.equal(validateCatalog(validCatalog), true);

  const invalidCatalog = {
    items: [{ id: 123 }] // id is not string
  };
  assert.equal(validateCatalog(invalidCatalog), false);
});

test('findProductVariant returns matching item and variant', () => {
  const catalog: CatalogData = {
    source: '',
    looks: [],
    items: [
      {
        id: 'shoes',
        name: 'Sneakers',
        type: 'Shoes',
        price: 149,
        image: '',
        sizes: ['42'],
        variants: [{ id: 57015167090993, a: true, o: ['42'] }],
        url: 'https://nike-makknzjs.myshopify.com/products/shoes'
      }
    ]
  };

  const match = findProductVariant(catalog, 57015167090993);
  assert.ok(match);
  assert.equal(match.product.name, 'Sneakers');
  assert.equal(match.variant.o[0], '42');

  const noMatch = findProductVariant(catalog, 999999);
  assert.equal(noMatch, null);
});

test('calculateBagTotal correctly sums price * quantity', () => {
  const catalog: CatalogData = {
    source: '',
    looks: [],
    items: [
      {
        id: 'item1',
        name: 'Item 1',
        type: '',
        price: 149,
        image: '',
        sizes: ['42'],
        variants: [{ id: 101, a: true, o: ['42'] }],
        url: 'https://nike-makknzjs.myshopify.com/products/item1'
      },
      {
        id: 'item2',
        name: 'Item 2',
        type: '',
        price: 199,
        image: '',
        sizes: ['M'],
        variants: [{ id: 102, a: true, o: ['M'] }],
        url: 'https://nike-makknzjs.myshopify.com/products/item2'
      }
    ]
  };

  const entries = [
    { id: 101, quantity: 2 }, // 149 * 2 = 298
    { id: 102, quantity: 1 }  // 199 * 1 = 199
  ];

  assert.equal(calculateBagTotal(catalog, entries), 497);
});

test('parseSavedBagEntries sanitizes stored data', () => {
  const valid = [
    { id: 101, quantity: 1 },
    { id: 102, quantity: 25 }, // > 20 invalid
    { id: '103', quantity: 1 }, // not integer id
    null,
    { id: 104, quantity: -2 }
  ];

  const parsed = parseSavedBagEntries(valid);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 101);
  assert.equal(parsed[0].quantity, 1);
});

test('buildShortlistText formats header and lines', () => {
  const catalog: CatalogData = {
    source: '',
    looks: [],
    items: [
      {
        id: 'tshirt',
        name: 'Tshirt',
        type: '',
        price: 199,
        image: '',
        sizes: ['S'],
        variants: [{ id: 101, a: true, o: ['S'] }],
        url: 'https://nike-makknzjs.myshopify.com/products/tshirt'
      }
    ]
  };

  const entries = [{ id: 101, quantity: 2 }];
  const text = buildShortlistText(catalog, entries);

  assert.ok(text.includes('RUNWAY — STYLING SHORTLIST'));
  assert.ok(text.includes('Reference prices; no order or payment has been placed.'));
  assert.ok(text.includes('Tshirt · Size S · Quantity 2'));
  assert.ok(text.includes('https://nike-makknzjs.myshopify.com/products/tshirt'));
});

test('generateTrackingNumber produces DHL-ZL- format with clean uppercase suffix', () => {
  const tracking1 = generateTrackingNumber('ZELI-ORD-849201');
  assert.equal(tracking1, 'DHL-ZL-849201');

  const tracking2 = generateTrackingNumber('custom-id-xyz123');
  assert.equal(tracking2, 'DHL-ZL-XYZ123');
});

test('TRACKING_STAGES contains chronological order milestones', () => {
  assert.equal(TRACKING_STAGES[0].key, 'confirmed');
  assert.equal(TRACKING_STAGES[TRACKING_STAGES.length - 1].key, 'delivered');
  assert.ok(TRACKING_STAGES.length >= 5);
});

test('generateGmailConfirmationContent creates complete email payload', () => {
  const mail = generateGmailConfirmationContent({
    orderId: 'ZELI-ORD-112233',
    customerName: 'Abu Bakkar',
    customerEmail: 'malikabubakkar523@gmail.com',
    totalAmount: 398.0,
    shippingAddress: '12 Atelier Boulevard',
    city: 'Milan',
    items: [
      { name: 'ZELI Forest Green Signature Hoodie', size: 'M', price: 199, quantity: 1 },
      { name: 'ZELI Orbit 01 Low Sneakers', size: '42', price: 199, quantity: 1 }
    ]
  });

  assert.equal(mail.to, 'malikabubakkar523@gmail.com');
  assert.ok(mail.subject.includes('ZELI-ORD-112233'));
  assert.equal(mail.trackingNumber, 'DHL-ZL-112233');
  assert.equal(mail.itemCount, 2);
  assert.equal(mail.total, 398.0);
});

test('getPageSeoMetadata returns distinct titles and descriptions for each view', () => {
  const home = getPageSeoMetadata('home');
  const orbit = getPageSeoMetadata('orbit');
  const runway = getPageSeoMetadata('runway');
  const atelier = getPageSeoMetadata('atelier');

  assert.ok(home.title.includes('ZELI'));
  assert.ok(orbit.title.includes('Orbit'));
  assert.ok(runway.title.includes('Runway'));
  assert.ok(atelier.title.includes('Atelier'));
  assert.notEqual(home.canonical, orbit.canonical);
});

