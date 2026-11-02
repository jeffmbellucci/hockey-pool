/**
 * Script to fetch and store scheduled games for a survivor contest week
 * This helps populate the games table with FUT (scheduled) games
 * 
 * Usage: node scripts/fetchSurvivorWeekSchedule.js <start_date> <end_date>
 * Example: node scripts/fetchSurvivorWeekSchedule.js 2025-10-06 2025-10-12
 */

require('dotenv').config();
const nhlService = require('../services/NhlService');

async function fetchWeekSchedule(startDate, endDate) {
  try {
    console.log(`\n🏒 Fetching scheduled games for week ${startDate} to ${endDate}...`);
    
    await nhlService.initialize();
    const result = await nhlService.fetchAndStoreScheduledGames(startDate, endDate);
    
    console.log('\n✅ Schedule fetch completed!');
    console.log(`   Games stored: ${result.games_stored}`);
    console.log(`   Games skipped: ${result.games_skipped}`);
    
    return result;
  } catch (error) {
    console.error('\n❌ Error fetching schedule:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.error('Usage: node scripts/fetchSurvivorWeekSchedule.js <start_date> <end_date>');
    console.error('Example: node scripts/fetchSurvivorWeekSchedule.js 2025-10-06 2025-10-12');
    process.exit(1);
  }
  
  const [startDate, endDate] = args;
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    console.error('Error: Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }
  
  fetchWeekSchedule(startDate, endDate)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed to fetch schedule');
      process.exit(1);
    });
}

module.exports = { fetchWeekSchedule };

