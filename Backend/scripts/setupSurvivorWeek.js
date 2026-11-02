/**
 * Script to setup a survivor week by fetching games and updating lock time
 * This combines fetching the schedule and updating the lock time in one command
 * 
 * Usage: node scripts/setupSurvivorWeek.js <contest_id> <week_number>
 * Example: node scripts/setupSurvivorWeek.js 11 1
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SurvivorService = require('../services/survivorService');
const nhlService = require('../services/NhlService');
const pool = require('../config/database');

async function setupWeek(contestId, weekNumber) {
  try {
    console.log(`\n🏒 Setting up Week ${weekNumber} for Contest ${contestId}...`);
    
    // Step 1: Get week dates from database
    console.log('\n📅 Step 1: Fetching week dates...');
    const weekQuery = `
      SELECT start_date, end_date 
      FROM survivor_weeks 
      WHERE contest_id = $1 AND week_number = $2
    `;
    const weekResult = await pool.query(weekQuery, [contestId, weekNumber]);
    
    if (weekResult.rows.length === 0) {
      throw new Error(`Week ${weekNumber} not found for contest ${contestId}`);
    }
    
    const { start_date, end_date } = weekResult.rows[0];
    
    // Format dates as YYYY-MM-DD strings
    const startDateStr = new Date(start_date).toISOString().split('T')[0];
    const endDateStr = new Date(end_date).toISOString().split('T')[0];
    
    console.log(`   Week ${weekNumber}: ${startDateStr} to ${endDateStr}`);
    
    // Step 2: Fetch schedule from NHL API
    console.log('\n🔍 Step 2: Fetching games schedule...');
    await nhlService.initialize();
    const scheduleResult = await nhlService.fetchAndStoreScheduledGames(startDateStr, endDateStr);
    
    console.log(`   ✅ Games stored: ${scheduleResult.games_stored}`);
    console.log(`   ⏭️  Games skipped: ${scheduleResult.games_skipped}`);
    
    if (scheduleResult.games_stored === 0) {
      console.log('\n⚠️  Warning: No games were stored. Lock time cannot be updated.');
      return {
        week_number: weekNumber,
        games_stored: 0,
        lock_time: null,
        message: 'No games found for this week'
      };
    }
    
    // Step 3: Update lock time based on first game
    console.log('\n🔒 Step 3: Updating lock time...');
    const lockResult = await SurvivorService.updateWeekLockTime(contestId, weekNumber);
    
    if (lockResult.lock_time) {
      console.log(`   ✅ Lock time set to: ${new Date(lockResult.lock_time).toLocaleString()}`);
    } else {
      console.log(`   ⚠️  ${lockResult.message}`);
    }
    
    console.log('\n✨ Week setup completed successfully!');
    
    return {
      week_number: weekNumber,
      start_date: startDateStr,
      end_date: endDateStr,
      games_stored: scheduleResult.games_stored,
      lock_time: lockResult.lock_time,
      lock_time_formatted: lockResult.lock_time ? new Date(lockResult.lock_time).toLocaleString() : null
    };
  } catch (error) {
    console.error('\n❌ Error setting up week:', error.message);
    throw error;
  }
}

async function setupAllWeeks(contestId) {
  try {
    console.log(`\n🏒 Setting up all weeks for Contest ${contestId}...`);
    
    // Get all weeks
    const weeksQuery = `
      SELECT week_number, start_date, end_date 
      FROM survivor_weeks 
      WHERE contest_id = $1 
      ORDER BY week_number
    `;
    const weeksResult = await pool.query(weeksQuery, [contestId]);
    
    console.log(`\n📊 Found ${weeksResult.rows.length} weeks to process`);
    
    const results = [];
    
    for (const week of weeksResult.rows) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        const result = await setupWeek(contestId, week.week_number);
        results.push({ success: true, ...result });
      } catch (error) {
        console.error(`\n❌ Failed to setup week ${week.week_number}: ${error.message}`);
        results.push({
          success: false,
          week_number: week.week_number,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('\n📊 SUMMARY:');
    const successful = results.filter(r => r.success && r.lock_time).length;
    const noGames = results.filter(r => r.success && !r.lock_time).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`   ✅ Successfully set up: ${successful} weeks`);
    console.log(`   ⚠️  No games found: ${noGames} weeks`);
    console.log(`   ❌ Failed: ${failed} weeks`);
    
    return {
      total: weeksResult.rows.length,
      successful,
      no_games: noGames,
      failed,
      results
    };
  } catch (error) {
    console.error('\n❌ Error setting up weeks:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node scripts/setupSurvivorWeek.js <contest_id> <week_number|all>');
    console.error('Examples:');
    console.error('  node scripts/setupSurvivorWeek.js 11 1       # Setup week 1 only');
    console.error('  node scripts/setupSurvivorWeek.js 11 all     # Setup all weeks');
    process.exit(1);
  }
  
  const contestId = parseInt(args[0]);
  const weekArg = args[1];
  
  if (isNaN(contestId)) {
    console.error('Error: contest_id must be a number');
    process.exit(1);
  }
  
  let promise;
  
  if (weekArg === 'all') {
    promise = setupAllWeeks(contestId);
  } else {
    const weekNumber = parseInt(weekArg);
    if (isNaN(weekNumber)) {
      console.error('Error: week_number must be a number or "all"');
      process.exit(1);
    }
    promise = setupWeek(contestId, weekNumber);
  }
  
  promise
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch(() => {
      console.error('\n💥 Setup failed');
      process.exit(1);
    });
}

module.exports = { setupWeek, setupAllWeeks };

