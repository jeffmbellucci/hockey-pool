/**
 * Survivor Contest Schema Verification Script
 * 
 * This script verifies that all survivor contest migrations have been
 * successfully executed and that the database schema is correct.
 * 
 * Run with: node scripts/verifySurvivorSchema.js
 */

const pool = require('../config/database');

async function verifySchema() {
  console.log('='.repeat(60));
  console.log('SURVIVOR CONTEST SCHEMA VERIFICATION');
  console.log('='.repeat(60));
  console.log();

  let allChecksPass = true;

  try {
    // Check 1: Verify contests table has survivor columns
    console.log('✓ Checking contests table extensions...');
    const contestsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'contests' 
        AND column_name IN ('current_week', 'phase', 'playoff_round', 'playoff_game_number', 'entry_fee', 'prize_pool')
      ORDER BY column_name
    `);
    
    if (contestsColumns.rows.length === 6) {
      console.log(`  ✅ All 6 survivor columns added to contests table`);
      contestsColumns.rows.forEach(col => {
        console.log(`     - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log(`  ❌ Expected 6 columns, found ${contestsColumns.rows.length}`);
      allChecksPass = false;
    }
    console.log();

    // Check 2: Verify survivor tables exist
    console.log('✓ Checking survivor tables...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'survivor_%'
      ORDER BY table_name
    `);
    
    const expectedTables = [
      'survivor_notifications',
      'survivor_participants',
      'survivor_picks',
      'survivor_team_usage',
      'survivor_weeks'
    ];
    
    const foundTables = tables.rows.map(r => r.table_name);
    
    if (foundTables.length === expectedTables.length) {
      console.log(`  ✅ All 5 survivor tables created`);
      foundTables.forEach(table => {
        console.log(`     - ${table}`);
      });
    } else {
      console.log(`  ❌ Expected ${expectedTables.length} tables, found ${foundTables.length}`);
      console.log(`     Missing: ${expectedTables.filter(t => !foundTables.includes(t)).join(', ')}`);
      allChecksPass = false;
    }
    console.log();

    // Check 3: Verify user_notification_preferences table
    console.log('✓ Checking user_notification_preferences table...');
    const prefsTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'user_notification_preferences'
    `);
    
    if (prefsTable.rows.length === 1) {
      console.log(`  ✅ user_notification_preferences table exists`);
    } else {
      console.log(`  ❌ user_notification_preferences table not found`);
      allChecksPass = false;
    }
    console.log();

    // Check 4: Verify survivor_weeks has seeded data
    console.log('✓ Checking survivor_weeks seed data...');
    const weeksCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM survivor_weeks 
      WHERE contest_id IS NULL
    `);
    
    const weekCount = parseInt(weeksCount.rows[0].count);
    if (weekCount === 26) {
      console.log(`  ✅ 26 template weeks seeded correctly`);
    } else {
      console.log(`  ❌ Expected 26 weeks, found ${weekCount}`);
      allChecksPass = false;
    }
    console.log();

    // Check 5: Verify indexes
    console.log('✓ Checking survivor indexes...');
    const indexes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (tablename LIKE 'survivor_%' OR indexname LIKE 'idx_survivor_%' OR indexname LIKE 'idx_notification_%')
      ORDER BY indexname
    `);
    
    console.log(`  ✅ ${indexes.rows.length} indexes created`);
    if (indexes.rows.length >= 25) {
      console.log(`     (Expected at least 25, found ${indexes.rows.length})`);
    } else {
      console.log(`     ⚠️  Expected at least 25 indexes, found ${indexes.rows.length}`);
    }
    console.log();

    // Check 6: Verify triggers
    console.log('✓ Checking triggers...');
    const triggers = await pool.query(`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE event_object_schema = 'public' 
        AND trigger_name LIKE '%survivor%'
      ORDER BY trigger_name
    `);
    
    if (triggers.rows.length >= 3) {
      console.log(`  ✅ ${triggers.rows.length} survivor triggers created`);
      triggers.rows.forEach(trigger => {
        console.log(`     - ${trigger.trigger_name} on ${trigger.event_object_table}`);
      });
    } else {
      console.log(`  ⚠️  Expected at least 3 triggers, found ${triggers.rows.length}`);
    }
    console.log();

    // Check 7: Verify foreign keys
    console.log('✓ Checking foreign key constraints...');
    const foreignKeys = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name LIKE 'survivor_%'
      ORDER BY tc.table_name
    `);
    
    if (foreignKeys.rows.length >= 10) {
      console.log(`  ✅ ${foreignKeys.rows.length} foreign key constraints defined`);
    } else {
      console.log(`  ⚠️  Expected at least 10 foreign keys, found ${foreignKeys.rows.length}`);
    }
    console.log();

    // Check 8: Verify helper function
    console.log('✓ Checking helper functions...');
    const functions = await pool.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name = 'create_default_notification_preferences'
    `);
    
    if (functions.rows.length === 1) {
      console.log(`  ✅ create_default_notification_preferences() function exists`);
    } else {
      console.log(`  ❌ create_default_notification_preferences() function not found`);
      allChecksPass = false;
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    if (allChecksPass) {
      console.log('✅ ALL CHECKS PASSED - Schema is ready for use!');
      console.log();
      console.log('Next steps:');
      console.log('1. Begin Task 2: Backend Core APIs');
      console.log('2. Create test survivor contest');
      console.log('3. Test participant registration');
    } else {
      console.log('❌ SOME CHECKS FAILED - Review migration execution');
      console.log();
      console.log('Recommended actions:');
      console.log('1. Check migration error logs');
      console.log('2. Re-run: npm run migrate');
      console.log('3. Verify database connection');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Verification failed with error:', error.message);
    console.error();
    console.error('Stack trace:', error.stack);
    allChecksPass = false;
  } finally {
    await pool.end();
    process.exit(allChecksPass ? 0 : 1);
  }
}

// Run verification if executed directly
if (require.main === module) {
  verifySchema();
}

module.exports = verifySchema;
