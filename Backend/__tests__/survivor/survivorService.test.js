/**
 * Survivor service tests — validates business logic and audit fixes N3, N6.
 */
const { mockPool, mockClient, resetMocks } = require('../helpers/testSetup');

// Require SurvivorService AFTER mock is set up
const SurvivorService = require('../../services/survivorService');

describe('SurvivorService', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('getAllContests', () => {
    test('returns contest list from query', async () => {
      const mockContests = [
        { contest_id: 1, contest_name: 'Survivor 2025', total_participants: '5', active_participants: '3' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockContests });

      const result = await SurvivorService.getAllContests();
      expect(result).toEqual(mockContests);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query.mock.calls[0][0]).toContain('survivor');
    });
  });

  describe('getContestById', () => {
    test('returns null when contest not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await SurvivorService.getContestById(999);
      expect(result).toBeNull();
    });

    test('returns contest with current week info', async () => {
      const contest = { contest_id: 2, contest_name: 'Test', current_week: 1 };
      const weekInfo = { week_number: 1, start_date: '2025-10-06', is_locked: false };
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [contest] })
        .mockResolvedValueOnce({ rows: [weekInfo] });

      const result = await SurvivorService.getContestById(2);
      expect(result.contest_id).toBe(2);
      expect(result.current_week_info).toEqual(weekInfo);
    });
  });

  describe('createContest — transaction safety', () => {
    const mockContest = { contest_id: 10, contest_name: 'New Survivor' };
    const contestData = {
      contest_name: 'New Survivor',
      season_year: '2026-27',
      season_start_date: '2026-10-08',
    };

    function mockCreation(templateCount) {
      mockClient.query.mockImplementation(async sql => {
        if (sql.includes('INSERT INTO contests')) return { rows: [mockContest] };
        if (sql.includes('FROM survivor_weeks')) return { rowCount: templateCount };
        return { rowCount: 28 };
      });
    }

    test.each(['2024-25', '2025-26'])('preserves the existing %s template', async (season) => {
      mockCreation(23);
      await SurvivorService.createContest({
        ...contestData,
        season_year: season,
      });

      expect(mockClient.query.mock.calls[0][0]).toBe('BEGIN');
      expect(mockClient.query.mock.calls[2][1]).toEqual([
        10, `${season.slice(0, 4)}-10-01`, `${Number(season.slice(0, 4)) + 1}-05-01`,
      ]);
      expect(mockClient.query).toHaveBeenCalledTimes(4);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['2026-27', '2026-10-08', '2027-04-17'],
      ['2027-28', '2027-10-08', '2028-04-17'],
    ])('covers the full %s season including a partial final week', async (season, start, end) => {
      mockCreation(0);
      const result = await SurvivorService.createContest({
        ...contestData, season_year: season, season_start_date: start, season_end_date: end,
      });

      const [query, [contestId, starts, ends]] = mockClient.query.mock.calls[2];
      expect(query).toContain('INSERT INTO survivor_weeks');
      expect(query).toContain('WITH ORDINALITY');
      expect(contestId).toBe(10);
      expect(starts).toHaveLength(28);
      expect(ends).toHaveLength(28);
      expect(starts[0]).toBe(start);
      expect(ends.at(-1)).toBe(end);
      for (let week = 0; week < starts.length; week++) {
        expect(Date.parse(ends[week]) - Date.parse(starts[week])).toBeLessThanOrEqual(6 * 86400000);
        if (week > 0) {
          expect(Date.parse(starts[week]) - Date.parse(ends[week - 1])).toBe(86400000);
        }
      }
      expect(result).toEqual(mockContest);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test('requires an end date when no season template exists', async () => {
      mockCreation(0);
      await expect(SurvivorService.createContest(contestData)).rejects.toThrow('regular-season end date');
      expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });

    test.each(['', 'invalid', '2027-02-30', '2025-10-08', undefined])(
      'rolls back for invalid fallback start date %s', async (start) => {
        mockCreation(0);
        await expect(SurvivorService.createContest({
          ...contestData, season_start_date: start,
        })).rejects.toThrow('Enter a valid season start date');
        expect(mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
        expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalledTimes(1);
      }
    );

    test('rolls back the contest if generated week insertion fails', async () => {
      mockCreation(0);
      mockClient.query.mockRejectedValueOnce(new Error('Week insertion failed'));
      await expect(SurvivorService.createContest(contestData)).rejects.toThrow('Week insertion failed');
      expect(mockClient.query.mock.calls.filter(([sql]) => sql === 'ROLLBACK')).toHaveLength(1);
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
