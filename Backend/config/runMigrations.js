const fs = require('fs');
const path = require('path');
const pool = require('./database');

// Function to run migrations
async function runMigrations() {
  const client = await pool.connect();
  let locked = false;
  try {
    // A rollout can start multiple processes; only one may read/apply the ledger at a time.
    await client.query("SELECT pg_advisory_lock(hashtext(current_database()), hashtext('hockey-pool-migrations'))");
    locked = true;
    // Get all migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    
    console.log('Running migrations...');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get list of already executed migrations
    const { rows } = await client.query('SELECT name FROM migrations');
    const executedMigrations = rows.map(row => row.name);
    
    // Execute migrations that haven't been run yet
    for (const file of files) {
      if (file.endsWith('.sql') && !executedMigrations.includes(file)) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        console.log(`Executing migration: ${file}`);
        
        // Begin transaction
        
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Migration ${file} completed successfully`);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`Migration ${file} failed:`, error);
          throw error;
        }
      }
    }
    
    console.log('All migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtext(current_database()), hashtext('hockey-pool-migrations'))");
      client.release();
    } catch (error) {
      client.release(error);
      throw error;
    }
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = runMigrations; 