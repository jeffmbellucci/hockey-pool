/**
 * Script to advance survivor contest to the next week
 * This should be run when the current week ends and a new week begins
 * 
 * Usage: node scripts/advanceSurvivorWeek.js <contest_id>
 * Example: node scripts/advanceSurvivorWeek.js 11
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/database');

/**
 * Advance contest to next week
 * @param {number} contestId - The contest ID
 * @param {boolean} dryRun - If true, only simulate without making changes
 */
async function advanceWeek(contestId, dryRun = false) {
  const client = await pool.connect();
  
  try {
    if (!dryRun) {
      await client.query('BEGIN');
    }
    
    console.log(`\n🏒 ${dryRun ? '[DRY RUN] ' : ''}Advancing Week for Contest ${contestId}...`);
    
    // Get current contest state
    const contestQuery = `
      SELECT 
        c.contest_id,
        c.contest_name,
        c.current_week,
        c.status,
        c.phase,
        sw.start_date as current_start,
        sw.end_date as current_end,
        sw.lock_time as current_lock_time
      FROM contests c
      LEFT JOIN survivor_weeks sw ON c.contest_id = sw.contest_id 
        AND c.current_week = sw.week_number
      WHERE c.contest_id = $1 AND c.contest_type = 'survivor'
    `;
    
    const contestResult = await client.query(contestQuery, [contestId]);
    
    if (contestResult.rows.length === 0) {
      throw new Error(`Survivor contest ${contestId} not found`);
    }
    
    const contest = contestResult.rows[0];
    
    console.log(`\n📊 Current State:`);
    console.log(`   Contest: ${contest.contest_name}`);
    console.log(`   Status: ${contest.status}`);
    console.log(`   Phase: ${contest.phase}`);
    console.log(`   Current Week: ${contest.current_week}`);
    console.log(`   Week Dates: ${contest.current_start} to ${contest.current_end}`);
    
    // Validate contest can advance
    if (contest.status === 'completed') {
      throw new Error('Contest is already completed');
    }
    
    if (contest.status === 'waiting') {
      throw new Error('Contest has not started yet. Start the contest first.');
    }
    
    // Check if current week has ended
    const now = new Date();
    const weekEnd = new Date(contest.current_end);
    weekEnd.setHours(23, 59, 59, 999); // End of day
    
    if (now < weekEnd) {
      console.log(`\n⚠️  Warning: Current week hasn't ended yet!`);
      console.log(`   Current time: ${now.toLocaleString()}`);
      console.log(`   Week ends: ${weekEnd.toLocaleString()}`);
      console.log(`   Time remaining: ${Math.ceil((weekEnd - now) / (1000 * 60 * 60))} hours`);
      
      if (!dryRun) {
        throw new Error('Cannot advance week before current week ends');
      }
    }
    
    const nextWeek = contest.current_week + 1;
    
    // Check if next week exists
    const nextWeekQuery = `
      SELECT * FROM survivor_weeks
      WHERE contest_id = $1 AND week_number = $2
    `;
    const nextWeekResult = await client.query(nextWeekQuery, [contestId, nextWeek]);
    
    if (nextWeekResult.rows.length === 0) {
      console.log(`\n🏁 Contest has reached the final week (Week ${contest.current_week})`);
      
      if (!dryRun) {
        // Mark contest as completed
        const completeQuery = `
          UPDATE contests
          SET status = 'completed',
              updated_at = NOW()
          WHERE contest_id = $1
          RETURNING *
        `;
        await client.query(completeQuery, [contestId]);
        console.log(`\n✅ Contest marked as COMPLETED`);
      } else {
        console.log(`\n[DRY RUN] Would mark contest as COMPLETED`);
      }
      
      if (!dryRun) {
        await client.query('COMMIT');
      }
      
      return {
        action: 'completed',
        current_week: contest.current_week,
        message: 'Contest completed - no more weeks'
      };
    }
    
    const nextWeekData = nextWeekResult.rows[0];
    
    console.log(`\n➡️  Next Week:`);
    console.log(`   Week Number: ${nextWeek}`);
    console.log(`   Dates: ${nextWeekData.start_date} to ${nextWeekData.end_date}`);
    console.log(`   Lock Time: ${nextWeekData.lock_time || 'Not set yet'}`);
    
    // Check for active participants
    const participantsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_eliminated = FALSE) as active
      FROM survivor_participants
      WHERE contest_id = $1
    `;
    const participantsResult = await client.query(participantsQuery, [contestId]);
    const stats = participantsResult.rows[0];
    
    console.log(`\n👥 Participants:`);
    console.log(`   Total: ${stats.total}`);
    console.log(`   Still Active: ${stats.active}`);
    console.log(`   Eliminated: ${stats.total - stats.active}`);
    
    // Check if next week has games scheduled
    const gamesQuery = `
      SELECT COUNT(*) as count
      FROM games
      WHERE game_date BETWEEN $1 AND $2
        AND game_type = 2
    `;
    const gamesResult = await client.query(gamesQuery, [
      nextWeekData.start_date,
      nextWeekData.end_date
    ]);
    const gamesCount = parseInt(gamesResult.rows[0].count);
    
    console.log(`\n🎮 Games for Week ${nextWeek}: ${gamesCount}`);
    
    if (gamesCount === 0) {
      console.log(`   ⚠️  Warning: No games scheduled for Week ${nextWeek}`);
      console.log(`   Run: node scripts/setupSurvivorWeek.js ${contestId} ${nextWeek}`);
    }
    
    if (!nextWeekData.lock_time) {
      console.log(`   ⚠️  Warning: Lock time not set for Week ${nextWeek}`);
      console.log(`   Run: node scripts/updateSurvivorLockTimes.js ${contestId} ${nextWeek}`);
    }
    
    // Advance the week
    if (!dryRun) {
      const updateQuery = `
        UPDATE contests
        SET current_week = $1,
            updated_at = NOW()
        WHERE contest_id = $2
        RETURNING *
      `;
      
      const updateResult = await client.query(updateQuery, [nextWeek, contestId]);
      
      await client.query('COMMIT');
      
      console.log(`\n✅ Week advanced successfully!`);
      console.log(`   ${contest.current_week} → ${nextWeek}`);
      
      return {
        action: 'advanced',
        previous_week: contest.current_week,
        current_week: nextWeek,
        next_week_dates: {
          start: nextWeekData.start_date,
          end: nextWeekData.end_date,
          lock_time: nextWeekData.lock_time
        },
        participants: stats,
        games_scheduled: gamesCount
      };
    } else {
      console.log(`\n[DRY RUN] Would advance week from ${contest.current_week} to ${nextWeek}`);
      
      return {
        action: 'dry_run',
        would_advance_to: nextWeek,
        current_week: contest.current_week,
        next_week_dates: {
          start: nextWeekData.start_date,
          end: nextWeekData.end_date,
          lock_time: nextWeekData.lock_time
        },
        participants: stats,
        games_scheduled: gamesCount
      };
    }
  } catch (error) {
    if (!dryRun) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if any contests need week advancement
 */
async function checkAllContests() {
  try {
    console.log('\n🔍 Checking all survivor contests for week advancement...\n');
    
    const query = `
      SELECT 
        c.contest_id,
        c.contest_name,
        c.current_week,
        c.status,
        sw.end_date as current_week_end
      FROM contests c
      LEFT JOIN survivor_weeks sw ON c.contest_id = sw.contest_id 
        AND c.current_week = sw.week_number
      WHERE c.contest_type = 'survivor'
        AND c.status IN ('in_progress', 'active')
      ORDER BY c.contest_id
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      console.log('No active survivor contests found.');
      return [];
    }
    
    const now = new Date();
    const needsAdvancement = [];
    
    for (const contest of result.rows) {
      const weekEnd = new Date(contest.current_week_end);
      weekEnd.setHours(23, 59, 59, 999);
      
      const hasEnded = now > weekEnd;
      const hoursRemaining = Math.ceil((weekEnd - now) / (1000 * 60 * 60));
      
      console.log(`Contest ${contest.contest_id}: ${contest.contest_name}`);
      console.log(`  Current Week: ${contest.current_week}`);
      console.log(`  Week Ends: ${weekEnd.toLocaleString()}`);
      console.log(`  Status: ${hasEnded ? '⚠️  NEEDS ADVANCEMENT' : `✅ Active (${hoursRemaining}h remaining)`}`);
      console.log('');
      
      if (hasEnded) {
        needsAdvancement.push(contest);
      }
    }
    
    return needsAdvancement;
  } catch (error) {
    console.error('Error checking contests:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--check') {
    // Check all contests
    checkAllContests()
      .then((needsAdvancement) => {
        if (needsAdvancement.length > 0) {
          console.log(`\n📋 ${needsAdvancement.length} contest(s) need advancement:`);
          needsAdvancement.forEach(c => {
            console.log(`   - Contest ${c.contest_id}: ${c.contest_name} (Week ${c.current_week})`);
            console.log(`     Run: node scripts/advanceSurvivorWeek.js ${c.contest_id}`);
          });
          process.exit(1); // Exit with error code to indicate action needed
        } else {
          console.log('✅ All contests are up to date!');
          process.exit(0);
        }
      })
      .catch(() => {
        process.exit(1);
      });
  } else {
    // Advance specific contest
    const contestId = parseInt(args[0]);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    
    if (isNaN(contestId)) {
      console.error('Usage: node scripts/advanceSurvivorWeek.js <contest_id> [--dry-run]');
      console.error('   or: node scripts/advanceSurvivorWeek.js --check');
      console.error('');
      console.error('Examples:');
      console.error('  node scripts/advanceSurvivorWeek.js 11          # Advance contest 11');
      console.error('  node scripts/advanceSurvivorWeek.js 11 --dry-run  # Test without changes');
      console.error('  node scripts/advanceSurvivorWeek.js --check     # Check all contests');
      process.exit(1);
    }
    
    advanceWeek(contestId, dryRun)
      .then((result) => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
      });
  }
}

module.exports = { advanceWeek, checkAllContests };

