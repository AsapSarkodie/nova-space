import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Sample users. All share the same demo password for convenience.
const DEMO_PASSWORD = 'password123';

const users = [
  { name: 'Ama Boateng', email: 'ama.boateng@st.knust.edu.gh', phone: '0244000001', hostel: 'Africa Hall' },
  { name: 'Kwame Mensah', email: 'kwame.mensah@st.knust.edu.gh', phone: '0244000002', hostel: 'Unity Hall' },
  { name: 'Nana Adjei', email: 'nana.adjei@st.knust.edu.gh', phone: '0244000003', hostel: 'Ayeduase (private)' },
  { name: 'Nova Store', email: 'store@novaspace.gh', phone: '0244000000', hostel: 'Kotei Hub' },
];

// listing_type: 'resale' (student used items), 'store' (Nova new/refurb), 'essential' (delivered goods)
const listingsBySeller = {
  'ama.boateng@st.knust.edu.gh': [
    { title: 'Binatone Standing Fan', listing_type: 'resale', category: 'Appliances', condition: 'Used - good', price: 90, description: 'Used one year, works perfectly. Leaving campus, must go this week.' },
    { title: 'Electric Kettle 1.7L', listing_type: 'resale', category: 'Appliances', condition: 'Used - good', price: 45, description: 'Fast boil, no leaks. Selling before I travel home.' },
  ],
  'kwame.mensah@st.knust.edu.gh': [
    { title: 'Mini Fridge (Nasco)', listing_type: 'resale', category: 'Appliances', condition: 'Used - fair', price: 620, description: 'Great for a hostel room. Cools well. Pick up from Unity Hall.' },
    { title: 'Rice Cooker 1.8L', listing_type: 'resale', category: 'Appliances', condition: 'Used - good', price: 110, description: 'Non-stick, clean. Comes with measuring cup.' },
  ],
  'store@novaspace.gh': [
    { title: 'Refurbished HP EliteBook (i5, 8GB)', listing_type: 'store', category: 'Laptops', condition: 'Refurbished', price: 2800, description: 'Nova-tested and cleaned. 3-day return window. Ideal for coursework.' },
    { title: 'Room-Ready Fresher Kit', listing_type: 'store', category: 'Bundles', condition: 'New', price: 480, description: 'Kettle + standing fan + extension board + reading lamp + iron. Everything for day one.' },
    { title: 'Extension Board (4-way, surge)', listing_type: 'store', category: 'Accessories', condition: 'New', price: 75, description: 'Surge-protected, sturdy cable. A hostel must-have.' },
    { title: 'LED Reading Lamp (rechargeable)', listing_type: 'store', category: 'Accessories', condition: 'New', price: 60, description: 'Rechargeable, three brightness levels. Good for late-night study.' },
    { title: 'Provisions Pack', listing_type: 'essential', category: 'Provisions', condition: 'New', price: 120, description: 'Milo, milk, oats, sugar, indomie, sardines. Delivered to your hostel.' },
    { title: 'Toiletries Starter Pack', listing_type: 'essential', category: 'Toiletries', condition: 'New', price: 90, description: 'Soap, toothpaste, tissue, detergent, sponge. Arrives at your door.' },
    { title: 'Bucket + Bowl Set', listing_type: 'essential', category: 'Household', condition: 'New', price: 55, description: 'Large bucket, bowl and cup set. Delivered same day where available.' },
  ],
};

async function seed() {
  console.log('Applying schema...');
  const schema = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);

  console.log('Clearing existing sample data...');
  await query('TRUNCATE orders, listings, users RESTART IDENTITY CASCADE');

  console.log('Inserting users...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const idByEmail = {};

  for (const u of users) {
    const isStudent = u.email.endsWith('.knust.edu.gh') || u.email.endsWith('@knust.edu.gh');
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, phone, hostel, is_student_verified)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [u.name, u.email, passwordHash, u.phone, u.hostel, isStudent]
    );
    idByEmail[u.email] = rows[0].id;
  }

  console.log('Inserting listings...');
  let count = 0;
  for (const [email, items] of Object.entries(listingsBySeller)) {
    for (const item of items) {
      await query(
        `INSERT INTO listings (seller_id, title, description, listing_type, category, condition, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idByEmail[email], item.title, item.description, item.listing_type, item.category, item.condition, item.price]
      );
      count += 1;
    }
  }

  console.log(`\nDone. Seeded ${users.length} users and ${count} listings.`);
  console.log('Demo login  ->  ama.boateng@st.knust.edu.gh / password123');
}

seed()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    console.error('Is PostgreSQL running and does the database exist? See README.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
