/**
 * Test script for week advancement functionality
 * This script helps you test week advancement in a controlled way
 * 
 * Usage: node scripts/testWeekAdvancement.js <contest_id>
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/database');
const { advanceWeek, checkAllContests } = require('./advanceSurvivorWeek');

/**
 * Setup test environment for week advancement
 */
async function setupTestEnvironment(contestId) {
  const client = await pool.connect();
  
  try {
    console.log('\n🧪 Setting up test environment...\n');
    
    // Get current contest state
    const contestQuery = `
      SELECT c.*, sw.start_date, sw.end_date
      FROM contests c
      JOIN survivor_weeks sw ON c.contest_id = sw.contest_id 
        AND c.current_week = sw.week_number
      WHERE c.contest_id = $1
    `;
    const result = await client.query(contestQuery, [contestId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Contest ${contestId} not found`);
    }
    
    const contest = result.rows[0];
    
    console.log('Current State:');
    console.log(`  Contest: ${contest.contest_name}`);
    console.log(`  Current Week: ${contest.current_week}`);
    console.log(`  Week Dates: ${contest.start_date} to ${contest.end_date}`);
    console.log('');
    
    // Option 1: Set current week to past (simulate week ending)
    console.log('Test Option 1: Simulate Current Week Ending');
    console.log('  This will set the current week end_date to yesterday');
    console.log(`  SQL: UPDATE survivor_weeks SET end_date = CURRENT_DATE - 1 WHERE contest_id = ${contestId} AND week_number = ${contest.current_week}`);
    console.log('');
    
    // Option 2: Jump to specific week
    console.log('Test Option 2: Jump to Specific Week');
    console.log('  This will set the contest to a specific week number');
    console.log(`  SQL: UPDATE contests SET current_week = X WHERE contest_id = ${contestId}`);
    console.log('');
    
    // Show next week info
    const nextWeekQuery = `
      SELECT * FROM survivor_weeks
      WHERE contest_id = $1 AND week_number = $2
    `;
    const nextWeekResult = await client.query(nextWeekQuery, [contestId, contest.current_week + 1]);
    
    if (nextWeekResult.rows.length > 0) {
      const nextWeek = nextWeekResult.rows[0];
      console.log('Next Week Info:');
      console.log(`  Week: ${nextWeek.week_number}`);
      console.log(`  Dates: ${nextWeek.start_date} to ${nextWeek.end_date}`);
      console.log(`  Lock Time: ${nextWeek.lock_time || 'Not set'}`);
      
      // Check if next week has games
      const gamesQuery = `
        SELECT COUNT(*) as count
        FROM games
        WHERE game_date BETWEEN $1 AND $2 AND game_type = 2
      `;
      const gamesResult = await client.query(gamesQuery, [nextWeek.start_date, nextWeek.end_date]);
      console.log(`  Games: ${gamesResult.rows[0].count}`);
    } else {
      console.log('⚠️  No next week found - this is the final week');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Choose a test option:');
    console.log('='.repeat(60));
    console.log('');
    console.log('1. Simulate week ending (set end_date to past)');
    console.log('2. Jump to specific week number');
    console.log('3. Run dry-run advancement (no changes)');
    console.log('4. Actually advance the week');
    console.log('5. Reset to Week 1');
    console.log('6. Exit');
    console.log('');
    
  } finally {
    client.release();
  }
}

/**
 * Simulate week ending by setting end_date to past
 */
async function simulateWeekEnding(contestId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const query = `
      UPDATE survivor_weeks sw
      SET end_date = CURRENT_DATE - 1
      FROM contests c
      WHERE sw.contest_id = c.contest_id
        AND sw.week_number = c.current_week
        AND c.contest_id = $1
      RETURNING sw.*
    `;
    
    const result = await client.query(query, [contestId]);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Week end date set to past');
    console.log(`   Week ${result.rows[0].week_number} now ends: ${result.rows[0].end_date}`);
    console.log('\n   Now you can run: node scripts/advanceSurvivorWeek.js ' + contestId);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Jump to specific week
 */
async function jumpToWeek(contestId, weekNumber) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify week exists
    const checkQuery = `
      SELECT * FROM survivor_weeks
      WHERE contest_id = $1 AND week_number = $2
    `;
    const checkResult = await client.query(checkQuery, [contestId, weekNumber]);
    
    if (checkResult.rows.length === 0) {
      throw new Error(`Week ${weekNumber} does not exist for contest ${contestId}`);
    }
    
    const updateQuery = `
      UPDATE contests
      SET current_week = $1
      WHERE contest_id = $2
      RETURNING *
    `;
    
    const result = await client.query(updateQuery, [weekNumber, contestId]);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Contest jumped to Week ' + weekNumber);
    console.log(`   Contest: ${result.rows[0].contest_name}`);
    console.log(`   Current Week: ${result.rows[0].current_week}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reset contest to Week 1
 */
async function resetToWeekOne(contestId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Reset contest to week 1
    await client.query(`
      UPDATE contests
      SET current_week = 1, status = 'in_progress'
      WHERE contest_id = $1
    `, [contestId]);
    
    // Reset all weeks to future dates (restore original dates)
    await client.query(`
      UPDATE survivor_weeks
      SET end_date = end_date + (CURRENT_DATE - end_date) + 30
      WHERE contest_id = $1 AND end_date < CURRENT_DATE
    `, [contestId]);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Contest reset to Week 1');
    console.log('   All week dates restored to future');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Interactive test runner
 */
async function runInteractiveTest(contestId) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise((resolve) => rl.question(query, resolve));
  
  try {
    await setupTestEnvironment(contestId);
    
    const choice = await question('Enter your choice (1-6): ');
    
    switch (choice.trim()) {
      case '1':
        await simulateWeekEnding(contestId);
        break;
        
      case '2':
        const weekNum = await question('Enter week number: ');
        await jumpToWeek(contestId, parseInt(weekNum));
        break;
        
      case '3':
        console.log('\n🧪 Running dry-run advancement...\n');
        await advanceWeek(contestId, true);
        break;
        
      case '4':
        console.log('\n⚡ Advancing week...\n');
        await advanceWeek(contestId, false);
        break;
        
      case '5':
        await resetToWeekOne(contestId);
        break;
        
      case '6':
        console.log('Exiting...');
        break;
        
      default:
        console.log('Invalid choice');
    }
    
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/testWeekAdvancement.js <contest_id>');
    console.error('Example: node scripts/testWeekAdvancement.js 11');
    process.exit(1);
  }
  
  const contestId = parseInt(args[0]);
  
  if (isNaN(contestId)) {
    console.error('Error: contest_id must be a number');
    process.exit(1);
  }
  
  runInteractiveTest(contestId)
    .then(() => {
      console.log('\n✨ Test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = {
  setupTestEnvironment,
  simulateWeekEnding,
  jumpToWeek,
  resetToWeekOne
};

