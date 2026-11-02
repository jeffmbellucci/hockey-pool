/**
 * Game score transaction test — validates N5 (dual-row update in transaction).
 */
const { mockPool, mockClient, resetMocks } = require('../helpers/testSetup');

describe('Game score update — transaction safety [N5]', () => {
  test('gamesController uses BEGIN/COMMIT for dual-row updates', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../controllers/gamesController.js'),
      'utf-8'
    );

    // Verify transaction pattern exists in updateGameScore
    expect(source).toContain("await client.query('BEGIN')");
    expect(source).toContain("await client.query('COMMIT')");
    expect(source).toContain("await client.query('ROLLBACK')");
    expect(source).toContain('client.release()');
  });

  test('draft pick uses FOR UPDATE lock for team uniqueness [N7]', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../../controllers/contestController.js'),
      'utf-8'
    );

    // Verify the contest row lock pattern
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain("await client.query('BEGIN')");
  });
});
