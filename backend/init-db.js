const { pool, testConnection, closePool } = require('./config/database');

/**
 * Database Initialization Script
 * Creates tables and seeds initial data for the cashback affiliate system
 *
 * Usage: node backend/init-db.js
 */

// Drop all tables (careful!)
async function dropTables() {
  console.log('🗑️  Dropping existing tables...');

  const dropQueries = [
    'DROP TABLE IF EXISTS conversions CASCADE',
    'DROP TABLE IF EXISTS clicks CASCADE',
    'DROP TABLE IF EXISTS merchants CASCADE',
    'DROP TABLE IF EXISTS users CASCADE',
    'DROP TYPE IF EXISTS click_type_enum CASCADE',
    'DROP TYPE IF EXISTS conversion_status_enum CASCADE'
  ];

  for (const query of dropQueries) {
    await pool.query(query);
  }

  console.log('✅ Tables dropped successfully');
}

// Create ENUM types
async function createEnums() {
  console.log('📝 Creating ENUM types...');

  await pool.query(`
    CREATE TYPE click_type_enum AS ENUM ('button', 'link');
  `);

  await pool.query(`
    CREATE TYPE conversion_status_enum AS ENUM ('pending', 'approved', 'rejected');
  `);

  console.log('✅ ENUM types created');
}

// Create users table
async function createUsersTable() {
  console.log('👤 Creating users table...');

  await pool.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20),
      available_balance DECIMAL(15, 2) DEFAULT 0.00,
      pending_balance DECIMAL(15, 2) DEFAULT 0.00,
      total_cashback DECIMAL(15, 2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create index for faster lookups
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_username ON users(username);

    -- Trigger to update updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Users table created');
}

// Create merchants table
async function createMerchantsTable() {
  console.log('🏪 Creating merchants table...');

  await pool.query(`
    CREATE TABLE merchants (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      logo_url TEXT,
      campaign_id VARCHAR(100),
      offer_id VARCHAR(100),
      commission_rate VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      deep_link_base TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create index
    CREATE INDEX idx_merchants_active ON merchants(is_active);

    -- Trigger for updated_at
    CREATE TRIGGER update_merchants_updated_at
      BEFORE UPDATE ON merchants
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Merchants table created');
}

// Create clicks table
async function createClicksTable() {
  console.log('👆 Creating clicks table...');

  await pool.query(`
    CREATE TABLE clicks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      aff_sid VARCHAR(100) UNIQUE NOT NULL,
      click_type click_type_enum NOT NULL,
      original_url TEXT,
      affiliate_url TEXT NOT NULL,
      utm_source VARCHAR(100) DEFAULT 'cashback',
      utm_medium VARCHAR(100),
      utm_campaign VARCHAR(100) DEFAULT 'lammmo',
      utm_content VARCHAR(100),
      sub4 VARCHAR(100) DEFAULT 'oneatweb',
      ip_address VARCHAR(45),
      user_agent TEXT,
      clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for faster lookups
    CREATE INDEX idx_clicks_aff_sid ON clicks(aff_sid);
    CREATE INDEX idx_clicks_user_id ON clicks(user_id);
    CREATE INDEX idx_clicks_merchant_id ON clicks(merchant_id);
    CREATE INDEX idx_clicks_clicked_at ON clicks(clicked_at DESC);
  `);

  console.log('✅ Clicks table created');
}

// Create conversions table
async function createConversionsTable() {
  console.log('💰 Creating conversions table...');

  await pool.query(`
    CREATE TABLE conversions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      click_id UUID REFERENCES clicks(id) ON DELETE SET NULL,
      accesstrade_conversion_id VARCHAR(100) UNIQUE NOT NULL,
      merchant_id VARCHAR(50),
      merchant_name VARCHAR(255),
      order_id VARCHAR(100),
      order_value DECIMAL(15, 2) DEFAULT 0.00,
      commission_amount DECIMAL(15, 2) DEFAULT 0.00,
      platform_cut DECIMAL(15, 2) DEFAULT 0.00,
      user_cashback DECIMAL(15, 2) DEFAULT 0.00,
      status conversion_status_enum DEFAULT 'pending',
      aff_sid VARCHAR(100),
      ordered_at TIMESTAMP,
      approved_at TIMESTAMP,
      rejected_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX idx_conversions_accesstrade_id ON conversions(accesstrade_conversion_id);
    CREATE INDEX idx_conversions_aff_sid ON conversions(aff_sid);
    CREATE INDEX idx_conversions_user_id ON conversions(user_id);
    CREATE INDEX idx_conversions_status ON conversions(status);
    CREATE INDEX idx_conversions_ordered_at ON conversions(ordered_at DESC);

    -- Trigger for updated_at
    CREATE TRIGGER update_conversions_updated_at
      BEFORE UPDATE ON conversions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log('✅ Conversions table created');
}

// Seed merchants data
async function seedMerchants() {
  console.log('🌱 Seeding merchants data...');

  const merchants = [
    {
      id: 'shopee',
      name: 'Shopee',
      logo_url: 'https://down-vn.img.susercontent.com/file/vn-50009109-159200e3e365de418aae52b840f24185',
      campaign_id: '4790392958945222748',
      offer_id: '4751584435713464237',
      commission_rate: '3-8%',
      is_active: true,
      deep_link_base: 'https://shope.ee/'
    },
    {
      id: 'lazada',
      name: 'Lazada',
      logo_url: 'https://laz-img-cdn.alicdn.com/images/ims-web/TB1T7D3dpXXXXXMXFXXXXXXXXXX.png',
      campaign_id: 'LAZADA_CAMPAIGN_ID',
      offer_id: 'LAZADA_OFFER_ID',
      commission_rate: '2-6%',
      is_active: true,
      deep_link_base: 'https://www.lazada.vn/'
    },
    {
      id: 'tiki',
      name: 'Tiki',
      logo_url: 'https://salt.tikicdn.com/ts/upload/0e/07/78/ee828743c9afa9792cf20d75995e134e.png',
      campaign_id: 'TIKI_CAMPAIGN_ID',
      offer_id: 'TIKI_OFFER_ID',
      commission_rate: '2-5%',
      is_active: true,
      deep_link_base: 'https://tiki.vn/'
    },
    {
      id: 'sendo',
      name: 'Sendo',
      logo_url: 'https://media.sendo.vn/image/png/sendo_logo.png',
      campaign_id: 'SENDO_CAMPAIGN_ID',
      offer_id: 'SENDO_OFFER_ID',
      commission_rate: '1-4%',
      is_active: true,
      deep_link_base: 'https://www.sendo.vn/'
    }
  ];

  for (const merchant of merchants) {
    await pool.query(
      `INSERT INTO merchants (id, name, logo_url, campaign_id, offer_id, commission_rate, is_active, deep_link_base)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        merchant.id,
        merchant.name,
        merchant.logo_url,
        merchant.campaign_id,
        merchant.offer_id,
        merchant.commission_rate,
        merchant.is_active,
        merchant.deep_link_base
      ]
    );
    console.log(`  ✓ Added merchant: ${merchant.name}`);
  }

  console.log('✅ Merchants seeded successfully');
}

// Seed sample user for testing
async function seedSampleUser() {
  console.log('👤 Seeding sample user...');

  // Password: "test123" (in production, use proper bcrypt)
  const passwordHash = '$2b$10$YQgZ1234567890abcdefghijklmnopqrstuvwxyz'; // Placeholder

  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, username, phone)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ['test@example.com', passwordHash, 'Test User', 'testuser', '0123456789']
  );

  console.log('✅ Sample user created: test@example.com');
}

// Main initialization function
async function initializeDatabase() {
  console.log('\n🚀 Starting database initialization...\n');

  try {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Cannot connect to database');
    }

    console.log('\n');

    // Drop existing tables (comment out in production!)
    await dropTables();

    // Create enums
    await createEnums();

    // Create tables in order (respecting foreign keys)
    await createUsersTable();
    await createMerchantsTable();
    await createClicksTable();
    await createConversionsTable();

    // Seed data
    await seedMerchants();
    await seedSampleUser();

    console.log('\n✅ Database initialization completed successfully!\n');

    // Display summary
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const merchantCount = await pool.query('SELECT COUNT(*) FROM merchants');

    console.log('📊 Summary:');
    console.log(`  • Users: ${userCount.rows[0].count}`);
    console.log(`  • Merchants: ${merchantCount.rows[0].count}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  initializeDatabase,
  dropTables,
  createUsersTable,
  createMerchantsTable,
  createClicksTable,
  createConversionsTable,
  seedMerchants
};
