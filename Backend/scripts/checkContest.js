const pool = require('../config/database');

async function checkContests() {
  try {
    // Check all contests
    const { rows: allContests } = await pool.query('SELECT * FROM contests ORDER BY created_at DESC');
    console.log('\n=== ALL CONTESTS ===');
    console.log(JSON.stringify(allContests, null, 2));

    // Check active two_team contests
    const { rows: activeContests } = await pool.query(
      `SELECT * FROM contests 
       WHERE contest_type = 'two_team' 
         AND status IN ('waiting', 'drafting', 'in_progress')
       ORDER BY created_at DESC`
    );
    console.log('\n=== ACTIVE TWO-TEAM CONTESTS ===');
    console.log(JSON.stringify(activeContests, null, 2));

    // Check participants for each contest
    for (const contest of allContests) {
      const { rows: participants } = await pool.query(
        'SELECT * FROM pool_participants WHERE contest_id = $1 ORDER BY draft_order',
        [contest.contest_id]
      );
      console.log(`\n=== PARTICIPANTS FOR CONTEST ${contest.contest_id} (${contest.contest_name}) ===`);
      console.log(JSON.stringify(participants, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkContests();

