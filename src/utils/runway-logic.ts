/**
 * Pure logic and math calculations for Runway carousel and styling bag.
 * Decoupled from DOM for testing and deterministic validation.
 */

export interface CatalogVariant {
  id: number;
  a: boolean;
  o: string[];
}

export interface CatalogItem {
  id: string;
  name: string;
  type: string;
  price: number;
  image: string;
  sizes: string[];
  variants: CatalogVariant[];
  url: string;
}

export interface CatalogLook {
  name: string;
  description: string;
  image: string;
  products: string[];
}

export interface CatalogData {
  source: string;
  looks: CatalogLook[];
  items: CatalogItem[];
}

export interface BagEntry {
  id: number;
  quantity: number;
}

export interface RingPose {
  phi: number;
  z: number;
  persp: number;
  sl: number;
  scale: number;
  x: number;
  bottom: number;
  blur: number;
  opacity: number;
  zIndex: number;
}

/**
 * Normalizes an angle into (-PI, PI]
 */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/**
 * Clamp a number to [min, max]
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Calculates slot pose in 3D ring mode (desktop)
 */
export function computeRingSlot(
  a: number,
  cur: number,
  W: number,
  H: number,
  fs: number = 1.08,
  isMobile: boolean = false
): RingPose {
  const step = (2 * Math.PI) / 12; // 30 deg
  const cx = 0.5 * W;
  const R = (isMobile ? 0.72 : 0.62) * W;
  const P = (isMobile ? 1.9 : 1.65) * W;
  const floor = H - 34;
  const horizon = 0.36 * H;

  const phi = wrapAngle((a - cur) * step);
  const z = R * (1 - Math.cos(phi));
  const persp = P / (P + z);
  const sl = Math.abs(phi) / step;
  const scale = persp * (1 + (fs - 1) * clamp(1 - sl, 0, 1));
  const x = cx + R * Math.sin(phi) * persp;
  const feet = horizon + (floor - horizon) * persp;
  const bottom = H - feet;
  const blur = sl <= 1 ? 1.8 * sl : Math.min(1.8 + (sl - 1) * 2, 6.5);
  const opacity = clamp((Math.cos(phi) + 0.55) / 0.3, 0, 1);
  const zIndex = Math.round(scale * 1000);

  return { phi, z, persp, sl, scale, x, bottom, blur, opacity, zIndex };
}

/**
 * Spring physics calculation for carousel position
 */
export function stepSpring(
  cur: number,
  target: number,
  vel: number,
  dt: number,
  K: number = 95,
  C: number = 2 * Math.sqrt(95)
): { cur: number; vel: number; settled: boolean } {
  const subSteps = 3;
  const h = dt / subSteps;
  let c = cur;
  let v = vel;

  for (let i = 0; i < subSteps; i++) {
    const acc = -K * (c - target) - C * v;
    v += acc * h;
    c += v * h;
  }

  const settled = Math.abs(c - target) <= 0.0005 && Math.abs(v) <= 0.0005;
  if (settled) {
    c = target;
    v = 0;
  }

  return { cur: c, vel: v, settled };
}

/**
 * Validates catalog data shape
 */
export function validateCatalog(data: unknown): data is CatalogData {
  if (!data || typeof data !== 'object') return false;
  const cat = data as CatalogData;
  if (!Array.isArray(cat.items)) return false;
  return cat.items.every(
    p =>
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      Number.isFinite(p.price) &&
      p.price >= 0 &&
      Array.isArray(p.variants) &&
      p.variants.every(
        v =>
          Number.isSafeInteger(v.id) &&
          typeof v.a === 'boolean' &&
          Array.isArray(v.o) &&
          v.o.every(o => typeof o === 'string')
      )
  );
}

/**
 * Finds variant and product in catalog
 */
export function findProductVariant(
  catalog: CatalogData,
  variantId: number
): { product: CatalogItem; variant: CatalogVariant } | null {
  for (const product of catalog.items) {
    const variant = product.variants.find(v => v.id === variantId && v.a === true);
    if (variant) return { product, variant };
  }
  return null;
}

/**
 * Calculates total price for bag entries
 */
export function calculateBagTotal(catalog: CatalogData, entries: BagEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    const res = findProductVariant(catalog, entry.id);
    if (res) {
      total += res.product.price * entry.quantity;
    }
  }
  return total;
}

/**
 * Filters and sanitizes raw storage data for bag
 */
export function parseSavedBagEntries(raw: unknown): BagEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is BagEntry =>
        !!e &&
        typeof e === 'object' &&
        Number.isSafeInteger((e as BagEntry).id) &&
        Number.isSafeInteger((e as BagEntry).quantity) &&
        (e as BagEntry).quantity > 0 &&
        (e as BagEntry).quantity <= 20
    )
    .slice(0, 50);
}

/**
 * Builds plaintext shortlist export
 */
export function buildShortlistText(catalog: CatalogData, entries: BagEntry[]): string {
  const parts = [
    'ZELI RUNWAY — STYLING SHORTLIST',
    'Reference prices; no order or payment has been placed.',
    '',
    ...entries.map(e => {
      const res = findProductVariant(catalog, e.id);
      if (!res) return '';
      const { product, variant } = res;
      return `${product.name} · Size ${variant.o.join(' / ')} · Quantity ${e.quantity}\n${product.url}`;
    }).filter(Boolean),
  ];
  return parts.join('\n\n');
}

/**
 * Generates deterministic DHL/ZELI tracking number from orderId
 */
export function generateTrackingNumber(orderId: string): string {
  const clean = orderId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(-6) || '984210';
  return `DHL-ZL-${suffix}`;
}

export interface TrackingStage {
  key: string;
  label: string;
  description: string;
  dateOffsetHours: number;
}

export const TRACKING_STAGES: TrackingStage[] = [
  { key: 'confirmed', label: 'Order Confirmed', description: 'Payment verified & order queued', dateOffsetHours: 0 },
  { key: 'processing', label: 'Atelier Tailoring', description: 'Garments handcrafted and prepared in ZELI Atelier', dateOffsetHours: 4 },
  { key: 'quality_check', label: 'Quality Inspected', description: 'Master craftsman sign-off & security sealed', dateOffsetHours: 12 },
  { key: 'shipped', label: 'Dispatched via DHL', description: 'Carrier collected parcel at Milan distribution hub', dateOffsetHours: 24 },
  { key: 'in_transit', label: 'In Transit', description: 'Arrived at regional international distribution facility', dateOffsetHours: 36 },
  { key: 'delivered', label: 'Delivered', description: 'Delivered directly to customer address', dateOffsetHours: 72 }
];

export function getActiveStageIndex(currentStage: string): number {
  const idx = TRACKING_STAGES.findIndex(s => s.key === currentStage);
  return idx >= 0 ? idx : 1; // Default to processing/atelier
}

/**
 * Generates formatted Gmail order and welcome confirmation
 */
export function generateGmailConfirmationContent(order: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  shippingAddress: string;
  city: string;
  postalCode?: string;
  country?: string;
  trackingNumber?: string;
  items?: Array<{ name: string; size?: string; price: number; quantity: number }>;
}) {
  const tracking = order.trackingNumber || generateTrackingNumber(order.orderId);
  const items = order.items || [];
  return {
    from: 'ZELI Studio <orders@zeli.studio>',
    to: order.customerEmail || 'collector@zeli.studio',
    subject: `Welcome to ZELI Studio — Order ${order.orderId} Confirmed & Tracking Active`,
    trackingNumber: tracking,
    carrier: 'DHL Express Worldwide',
    summary: `Welcome to ZELI Atelier, ${order.customerName || 'Valued Collector'}! Your order ${order.orderId} is confirmed and currently undergoing precision quality inspection.`,
    itemCount: items.reduce((sum, i) => sum + (i.quantity || 1), 0),
    total: order.totalAmount
  };
}

/**
 * Returns dynamic page SEO title, description, and canonical path
 */
export function getPageSeoMetadata(pageKey: string): { title: string; description: string; canonical: string } {
  switch (pageKey) {
    case 'orbit':
      return {
        title: 'ZELI Orbit — 3D Footwear Carousel & Size Atelier | ZELI',
        description: 'Explore the 3D rotating footwear ring. Select sizes 40-46, view full sneaker specifications, and add directly to your bag.',
        canonical: '#/orbit'
      };
    case 'handrail':
      return {
        title: 'Hand Rail Pro — Architectural Clothes Rack Showcase | ZELI',
        description: 'Interactive curved clothing rail featuring heavyweight fleece hoodies, boxy graphic tees, and tailored streetwear.',
        canonical: '#/handrail'
      };
    case 'runway':
      return {
        title: 'Runway — Try the Look 3D Interactive Runway | ZELI',
        description: 'Six looks styled head to toe on a turning 3D stage with numbered garment pins and instant bundle styling.',
        canonical: '#/runway'
      };
    case 'atelier':
      return {
        title: 'Shoe Atelier — A Place for Every Pair · 17 Footwear Icons | ZELI',
        description: 'Summer 26 Shoe Atelier. Seventeen sneakers on pedestal platforms with shuffle, quick size selector, and free 30-day returns.',
        canonical: '#/atelier'
      };
    case 'catalog':
      return {
        title: 'All Products (24) — Complete ZELI Streetwear Collection | ZELI',
        description: 'Browse all 24 luxury streetwear pieces: organic heavyweight fleece hoodies, knitwear, cargo pants, sneakers, and modular bags.',
        canonical: '#/catalog'
      };
    case 'account':
      return {
        title: 'Member Account & Order Tracking Dashboard | ZELI',
        description: 'Track your live orders in real time, view Gmail confirmation dispatches, and manage your ZELI member profile.',
        canonical: '#/account'
      };
    case 'track':
      return {
        title: 'Live Order Tracking & Shipment Status | ZELI',
        description: 'Enter your order ID or tracking code to monitor real-time atelier tailoring and DHL Express international transit.',
        canonical: '#/track'
      };
    case 'home':
    default:
      return {
        title: 'ZELI — Luxury Streetwear Runway, Exclusive Sneakers & Ready-to-Wear',
        description: 'Explore ZELI runway collection: premium heavyweight hoodies, exclusive footwear, tactical pants, and modular streetwear bags.',
        canonical: '#/home'
      };
  }
}

