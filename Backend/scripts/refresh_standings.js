/**
 * Script to manually refresh the team_standings materialized view and recalculate pick totals
 * 
 * Usage:
 *   node Backend/scripts/refresh_standings.js
 * 
 * This script should be run:
 * - After clearing or deleting games from the database
 * - After manually modifying game results
 * - Whenever standings or pick totals appear incorrect
 * - After the Python backend updates games
 * 
 * What it does:
 * 1. Refreshes the team_standings materialized view from the games table
 * 2. Recalculates total_wins for all two-team picks
 * 3. Recalculates total_playoff_wins for all playoff picks
 */

const pool = require('../config/database');
const TeamStandings = require('../models/TeamStandings');
const TwoTeamPick = require('../models/TwoTeamPick');

async function refreshStandings() {
  try {
    console.log('🔄 Refreshing team_standings materialized view...');
    
    // Refresh the materialized view
    await TeamStandings.refresh();
    console.log('✅ team_standings refreshed successfully');
    
    // Recalculate all two-team pick totals
    console.log('🔄 Recalculating two-team pick totals...');
    const updated = await TwoTeamPick.calculateAndUpdateAllWins();
    console.log(`✅ Updated ${updated.length} two-team picks`);
    
    // Recalculate playoff picks
    console.log('🔄 Recalculating playoff pick totals...');
    const PlayoffPick = require('../models/PlayoffPick');
    const playoffUpdated = await PlayoffPick.calculateAndUpdateAllWins();
    console.log(`✅ Updated ${playoffUpdated.length} playoff picks`);
    
    // Show current standings
    console.log('\n📊 Current Team Standings:');
    const standings = await TeamStandings.findAllWithDetails();
    standings.forEach(team => {
      console.log(`  ${team.team_name.padEnd(25)} - W: ${team.wins || 0}, L: ${team.losses || 0}, Points: ${team.points || 0}`);
    });
    
    console.log('\n✅ Refresh complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error refreshing standings:', error);
    process.exit(1);
  }
}

refreshStandings();

