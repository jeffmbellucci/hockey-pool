/**
 * Script to update lock times for survivor contest weeks
 * This should be run after fetching the week's schedule
 * 
 * Usage: 
 *   node scripts/updateSurvivorLockTimes.js <contest_id> <week_number>
 *   node scripts/updateSurvivorLockTimes.js <contest_id> all
 * 
 * Examples:
 *   node scripts/updateSurvivorLockTimes.js 11 1       # Update week 1 only
 *   node scripts/updateSurvivorLockTimes.js 11 all     # Update all weeks
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SurvivorService = require('../services/survivorService');

async function updateLockTime(contestId, weekNumber) {
  try {
    console.log(`\n🔒 Updating lock time for Contest ${contestId}, Week ${weekNumber}...`);
    
    const result = await SurvivorService.updateWeekLockTime(contestId, weekNumber);
    
    if (result.lock_time) {
      console.log(`✅ ${result.message}`);
      console.log(`   Week: ${result.week_number}`);
      console.log(`   Period: ${result.start_date} to ${result.end_date}`);
      console.log(`   Lock Time: ${new Date(result.lock_time).toLocaleString()}`);
    } else {
      console.log(`⚠️  ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error updating lock time:`, error.message);
    throw error;
  }
}

async function updateAllLockTimes(contestId) {
  try {
    console.log(`\n🔒 Updating lock times for all weeks in Contest ${contestId}...`);
    
    const result = await SurvivorService.updateAllWeekLockTimes(contestId);
    
    console.log(`\n✅ Lock time update completed!`);
    console.log(`   Total weeks: ${result.total_weeks}`);
    console.log(`   Successfully updated: ${result.updated}`);
    console.log(`   Failed/No games: ${result.failed}`);
    
    if (result.results.length > 0) {
      console.log(`\n📊 Detailed Results:`);
      result.results.forEach(r => {
        if (r.lock_time) {
          console.log(`   ✅ Week ${r.week_number}: ${new Date(r.lock_time).toLocaleString()}`);
        } else if (r.error) {
          console.log(`   ❌ Week ${r.week_number}: ${r.error}`);
        } else {
          console.log(`   ⚠️  Week ${r.week_number}: No games found`);
        }
      });
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error updating lock times:`, error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.error('Usage: node scripts/updateSurvivorLockTimes.js <contest_id> <week_number|all>');
    console.error('Examples:');
    console.error('  node scripts/updateSurvivorLockTimes.js 11 1       # Update week 1 only');
    console.error('  node scripts/updateSurvivorLockTimes.js 11 all     # Update all weeks');
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
    promise = updateAllLockTimes(contestId);
  } else {
    const weekNumber = parseInt(weekArg);
    if (isNaN(weekNumber)) {
      console.error('Error: week_number must be a number or "all"');
      process.exit(1);
    }
    promise = updateLockTime(contestId, weekNumber);
  }
  
  promise
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed to update lock times');
      process.exit(1);
    });
}

module.exports = { updateLockTime, updateAllLockTimes };

