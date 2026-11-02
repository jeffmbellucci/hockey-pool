/**
 * Script to manually add 2024-25 season template weeks
 * Run this if migration 38 hasn't been run yet
 * 
 * Usage:
 *   node Backend/scripts/add_2024_25_weeks.js
 */

const pool = require('../config/database');

async function add2024_25Weeks() {
  const client = await pool.connect();
  
  try {
    console.log('🏒 Adding 2024-25 season template weeks...\n');
    
    // Check if weeks already exist
    const checkQuery = `
      SELECT COUNT(*) as count 
      FROM survivor_weeks 
      WHERE contest_id IS NULL 
        AND start_date >= '2024-10-01' 
        AND start_date < '2025-05-01'
    `;
    const checkResult = await client.query(checkQuery);
    const existingCount = parseInt(checkResult.rows[0].count);
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing 2024-25 template weeks.`);
      console.log('   Deleting them to avoid duplicates...\n');
      
      await client.query(`
        DELETE FROM survivor_weeks 
        WHERE contest_id IS NULL 
          AND start_date >= '2024-10-01' 
          AND start_date < '2025-05-01'
      `);
      
      console.log('✅ Old template weeks deleted.\n');
    }
    
    // Insert the 23 weeks for 2024-25 season
    const insertQuery = `
      INSERT INTO survivor_weeks (contest_id, week_number, start_date, end_date, is_locked)
      VALUES
      -- October 2024 weeks
      (NULL, 1, '2024-10-10', '2024-10-16', FALSE),
      (NULL, 2, '2024-10-17', '2024-10-23', FALSE),
      (NULL, 3, '2024-10-24', '2024-10-30', FALSE),
      (NULL, 4, '2024-10-31', '2024-11-06', FALSE),
      
      -- November 2024 weeks
      (NULL, 5, '2024-11-07', '2024-11-13', FALSE),
      (NULL, 6, '2024-11-14', '2024-11-20', FALSE),
      (NULL, 7, '2024-11-21', '2024-11-27', FALSE),
      (NULL, 8, '2024-11-28', '2024-12-04', FALSE),
      
      -- December 2024 weeks
      (NULL, 9, '2024-12-05', '2024-12-11', FALSE),
      (NULL, 10, '2024-12-12', '2024-12-18', FALSE),
      (NULL, 11, '2024-12-19', '2024-12-25', FALSE),
      (NULL, 12, '2024-12-26', '2025-01-01', FALSE),
      
      -- January 2025 weeks
      (NULL, 13, '2025-01-02', '2025-01-08', FALSE),
      (NULL, 14, '2025-01-09', '2025-01-15', FALSE),
      (NULL, 15, '2025-01-16', '2025-01-22', FALSE),
      (NULL, 16, '2025-01-23', '2025-01-29', FALSE),
      
      -- February 2025 weeks
      (NULL, 17, '2025-02-06', '2025-02-12', FALSE),
      (NULL, 18, '2025-02-13', '2025-02-19', FALSE),
      (NULL, 19, '2025-02-20', '2025-02-26', FALSE),
      (NULL, 20, '2025-02-27', '2025-03-05', FALSE),
      
      -- March 2025 weeks
      (NULL, 21, '2025-03-06', '2025-03-12', FALSE),
      (NULL, 22, '2025-03-13', '2025-03-19', FALSE),
      (NULL, 23, '2025-03-20', '2025-03-26', FALSE)
    `;
    
    await client.query(insertQuery);
    
    console.log('✅ Successfully added 23 template weeks for 2024-25 season!\n');
    
    // Verify the insert
    const verifyResult = await client.query(checkQuery);
    const newCount = parseInt(verifyResult.rows[0].count);
    
    console.log(`📊 Template weeks for 2024-25 season: ${newCount}`);
    
    // Also show 2025-26 template weeks count
    const future2526Query = `
      SELECT COUNT(*) as count 
      FROM survivor_weeks 
      WHERE contest_id IS NULL 
        AND start_date >= '2025-10-01'
    `;
    const future2526Result = await client.query(future2526Query);
    const future2526Count = parseInt(future2526Result.rows[0].count);
    
    console.log(`📊 Template weeks for 2025-26 season: ${future2526Count}`);
    
    console.log('\n✨ Done! You can now create survivor contests for 2024-25 season.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding template weeks:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

add2024_25Weeks();

