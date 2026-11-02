const axios = require('axios');
const pool = require('../config/database');

/**
 * NHL Service
 * Direct integration with the NHL API (api-web.nhle.com/v1).
 * Replaces the Python backend — fetches, processes, and stores
 * regular-season games, playoff games, playoff standings, and playoff series.
 */

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const HTTP_TIMEOUT = parseInt(process.env.NHL_API_TIMEOUT) || 30000;

class NhlService {
  constructor() {
    this.isInitialized = false;
    // Cache to avoid duplicate API calls within the same fetch cycle
    // Key: dateString, Value: { data, timestamp }
    this._gamesCache = new Map();
    this._gamesCacheTTL = 60 * 1000; // 60 seconds
    this._scheduleLoads = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    console.log('🏒 NHL Service initialized (direct API integration)');
    this.isInitialized = true;
  }

  // ---------------------------------------------------------------------------
  //  Team helpers
  // ---------------------------------------------------------------------------

  async getTeamByNhlApiId(nhlApiId) {
    const { rows } = await pool.query(
      'SELECT team_id, nhl_api_id, team_name, abbreviation FROM nhl_teams WHERE nhl_api_id = $1',
      [nhlApiId]
    );
    return rows[0] || null;
  }

  async ensureTeamExists(nhlApiId, teamName, teamAbbrev) {
    let team = await this.getTeamByNhlApiId(nhlApiId);
    if (team) return team;

    const divResult = await pool.query('SELECT division_id FROM divisions LIMIT 1');
    const divisionId = divResult.rows[0]?.division_id || 1;

    await pool.query(
      `INSERT INTO nhl_teams (team_name, abbreviation, division_id, nhl_api_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (abbreviation) DO UPDATE SET nhl_api_id = $4`,
      [teamName, teamAbbrev, divisionId, nhlApiId]
    );
    console.log(`✅ Team ${teamName} (${teamAbbrev}) with NHL API ID ${nhlApiId} added`);
    return this.getTeamByNhlApiId(nhlApiId);
  }

  // ---------------------------------------------------------------------------
  //  NHL API HTTP helpers
  // ---------------------------------------------------------------------------

  async fetchFromNhl(path, retries = 3) {
    const url = `${NHL_API_BASE}${path}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data } = await axios.get(url, { timeout: HTTP_TIMEOUT });
        return data;
      } catch (err) {
        console.error(`❌ NHL API error (${url}) attempt ${attempt}/${retries}:`, err.message);
        if (attempt === retries) throw new Error(`NHL feed unavailable: ${path}`);
        if (attempt < retries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Regular-season games (gameType = 2)
  // ---------------------------------------------------------------------------

  /**
   * Fetch games from the NHL API for a given date.
   * Returns the raw games array or [].
   */
  async fetchGamesForDate(dateString) {
    // Return cached result if fresh (avoids duplicate API calls when
    // processRegularSeasonGamesForDate, processPlayoffGamesForDate, and
    // syncPlayoffSeriesForDate are called for the same date)
    const cached = this._gamesCache.get(dateString);
    if (cached && (Date.now() - cached.timestamp) < this._gamesCacheTTL) {
      return cached.data;
    }

    const data = await this.fetchFromNhl(`/score/${dateString}`);
    if (!Array.isArray(data?.games)) throw new Error(`Invalid NHL games response for ${dateString}`);
    const games = data.games;

    this._gamesCache.set(dateString, { data: games, timestamp: Date.now() });

    // Evict stale entries to prevent memory leak
    for (const [key, val] of this._gamesCache) {
      if (Date.now() - val.timestamp > this._gamesCacheTTL * 5) {
        this._gamesCache.delete(key);
      }
    }

    return games;
  }

  /**
   * Process one finished regular-season game into a result object.
   * Returns null for non-regular-season or unfinished games.
   */
  processRegularSeasonGame(game) {
    if (game.gameType !== 2) return null;

    const away = game.awayTeam || {};
    const home = game.homeTeam || {};
    if (!away.id || !home.id) return null;

    const awayScore = away.score ?? 0;
    const homeScore = home.score ?? 0;
    const gameState = game.gameState;

    let result = null;
    if (gameState === 'OFF' || gameState === 'FINAL') {
      const periodType = game.gameOutcome?.lastPeriodType || 'REG';
      const loserResult = periodType === 'OT' ? 'OTL' : periodType === 'SO' ? 'SOL' : 'L';

      let awayResult, homeResult;
      if (awayScore > homeScore) {
        awayResult = 'W';
        homeResult = loserResult;
      } else {
        homeResult = 'W';
        awayResult = loserResult;
      }

      result = { awayResult, homeResult };
    }

    return {
      gameId: game.id,
      gameDate: game.gameDate,
      gameState,
      startTimeUtc: game.startTimeUTC || null,
      away: { nhlId: away.id, abbrev: away.abbrev, score: awayScore, logo: away.logo },
      home: { nhlId: home.id, abbrev: home.abbrev, score: homeScore, logo: home.logo },
      result,
    };
  }

  /**
   * Preserve the UTC offset when writing timezone-aware game start timestamps.
   */
  parseStartTime(startTimeUtc) {
    if (!startTimeUtc) return null;
    try {
      const d = new Date(startTimeUtc);
      return d.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Upsert a single game row (one team perspective).
   * Used for both finished and scheduled (FUT) games.
   * All game types (regular season + playoffs) go into the `games` table.
   */
  async upsertGameRow(table, { gameId, gameDate, gameType, gameState, teamId, teamAbbrev, teamScore, isHome, opponentId, opponentAbbrev, opponentScore, opponentLogo, result, startTimeUtc, seriesId, round, gameNumberInSeries }) {
    const startTime = this.parseStartTime(startTimeUtc);

    const query = `
      INSERT INTO games (game_id, game_date, game_type, game_state,
        team_id, team_abbrev, team_score, is_home,
        opponent_id, opponent_abbrev, opponent_score, opponent_logo,
        result, start_time_utc, series_id, round, game_number_in_series)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (game_id, team_id) DO UPDATE SET
        game_state=CASE WHEN games.score_overridden THEN games.game_state ELSE $4 END,
        team_score=CASE WHEN games.score_overridden THEN games.team_score ELSE $7 END,
        opponent_score=CASE WHEN games.score_overridden THEN games.opponent_score ELSE $11 END,
        opponent_logo=$12,
        result=CASE WHEN games.score_overridden THEN games.result ELSE $13 END,
        game_date=$2, start_time_utc=$14, series_id=COALESCE($15, games.series_id),
        round=COALESCE($16, games.round),
        game_number_in_series=COALESCE($17, games.game_number_in_series),
        updated_at=CURRENT_TIMESTAMP
    `;

    await pool.query(query, [gameId, gameDate, gameType, gameState, teamId, teamAbbrev, teamScore, isHome, opponentId, opponentAbbrev, opponentScore, opponentLogo, result, startTime, seriesId || null, round || null, gameNumberInSeries || null]);
  }

  /**
   * Store a game from both team perspectives into the given table.
   */
  async storeBothPerspectives(table, gameType, parsed, awayDbId, homeDbId) {
    const base = {
      gameId: parsed.gameId,
      gameDate: parsed.gameDate,
      gameType,
      gameState: parsed.gameState,
      startTimeUtc: parsed.startTimeUtc,
      seriesId: parsed.seriesId || null,
      round: parsed.round || null,
      gameNumberInSeries: parsed.gameNumberInSeries || null,
    };

    // Away perspective
    await this.upsertGameRow(table, {
      ...base,
      teamId: awayDbId,
      teamAbbrev: parsed.away.abbrev,
      teamScore: parsed.away.score,
      isHome: false,
      opponentId: homeDbId,
      opponentAbbrev: parsed.home.abbrev,
      opponentScore: parsed.home.score,
      opponentLogo: parsed.home.logo,
      result: parsed.result?.awayResult ?? 'PENDING',
    });

    // Home perspective
    await this.upsertGameRow(table, {
      ...base,
      teamId: homeDbId,
      teamAbbrev: parsed.home.abbrev,
      teamScore: parsed.home.score,
      isHome: true,
      opponentId: awayDbId,
      opponentAbbrev: parsed.away.abbrev,
      opponentScore: parsed.away.score,
      opponentLogo: parsed.away.logo,
      result: parsed.result?.homeResult ?? 'PENDING',
    });
  }

  /**
   * Fetch, process, and store all regular-season games for a date.
   * Returns a summary object.
   */
  async processRegularSeasonGamesForDate(dateString) {
    const games = await this.fetchGamesForDate(dateString);
    let processed = 0;
    let skipped = 0;

    for (const game of games) {
      if (game.gameType !== 2) { skipped++; continue; }

      const parsed = this.processRegularSeasonGame(game);
      if (!parsed) { skipped++; continue; }

      const awayTeam = await this.ensureTeamExists(parsed.away.nhlId, parsed.away.abbrev, parsed.away.abbrev);
      const homeTeam = await this.ensureTeamExists(parsed.home.nhlId, parsed.home.abbrev, parsed.home.abbrev);

      await this.storeBothPerspectives('games', 2, parsed, awayTeam.team_id, homeTeam.team_id);
      processed++;
    }

    if (processed > 0) {
      await this.refreshStandingsAndPicks();
    }

    return { date: dateString, total: games.length, processed, skipped };
  }

  // ---------------------------------------------------------------------------
  //  Scheduled / future games (for survivor week setup)
  // ---------------------------------------------------------------------------

  /**
   * Fetch and store scheduled games (FUT/LIVE) for a date range.
   * Stores both perspectives so survivor queries work.
   */
  async fetchAndStoreScheduledGames(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let stored = 0;
    let skipped = 0;

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const games = await this.fetchGamesForDate(ds);
      if (games.some(game => game.gameType === 3)) await this.processPlayoffGamesForDate(ds);

      for (const game of games) {
        if (game.gameType !== 2) { skipped++; continue; }

        const state = game.gameState;
        // Store any state: FUT (scheduled), LIVE (in progress), OFF/FINAL (finished)
        const away = game.awayTeam || {};
        const home = game.homeTeam || {};

        const isFinished = state === 'OFF' || state === 'FINAL';
        const awayScore = isFinished ? (away.score ?? 0) : null;
        const homeScore = isFinished ? (home.score ?? 0) : null;

        let awayResult = 'PENDING';
        let homeResult = 'PENDING';
        if (isFinished) {
          const periodType = game.gameOutcome?.lastPeriodType || 'REG';
          const loserResult = periodType === 'OT' ? 'OTL' : periodType === 'SO' ? 'SOL' : 'L';
          if (awayScore > homeScore) { awayResult = 'W'; homeResult = loserResult; }
          else if (homeScore > awayScore) { homeResult = 'W'; awayResult = loserResult; }
        }

        const awayTeam = await this.ensureTeamExists(away.id, away.abbrev, away.abbrev);
        const homeTeam = await this.ensureTeamExists(home.id, home.abbrev, home.abbrev);

        const parsed = {
          gameId: game.id,
          gameDate: game.gameDate,
          gameState: state,
          startTimeUtc: game.startTimeUTC || null,
          away: { abbrev: away.abbrev, score: awayScore, logo: away.logo },
          home: { abbrev: home.abbrev, score: homeScore, logo: home.logo },
          result: { awayResult, homeResult },
        };

        await this.storeBothPerspectives('games', 2, parsed, awayTeam.team_id, homeTeam.team_id);
        stored++;
      }
    }

    if (stored > 0) {
      await this.refreshStandingsAndPicks();
    }

    return { start_date: startDate, end_date: endDate, games_stored: stored, games_skipped: skipped };
  }

  async ensureScheduledGames(startDate, endDate) {
    const key = `${startDate}:${endDate}`;
    const now = Date.now();
    for (const [range, entry] of this._scheduleLoads) {
      if (entry.expiresAt <= now) this._scheduleLoads.delete(range);
    }
    if (this._scheduleLoads.has(key)) return this._scheduleLoads.get(key).promise;
    // Share in-flight requests and cache only fully successful week loads for five minutes.
    const entry = { expiresAt: Infinity };
    entry.promise = this.fetchAndStoreScheduledGames(startDate, endDate)
      .then(result => { entry.expiresAt = Date.now() + 5 * 60 * 1000; return result; })
      .catch(error => { this._scheduleLoads.delete(key); throw error; });
    this._scheduleLoads.set(key, entry);
    return entry.promise;
  }

  // ---------------------------------------------------------------------------
  //  Playoff games (gameType = 3)
  // ---------------------------------------------------------------------------

  async processPlayoffGamesForDate(dateString) {
    const games = await this.fetchGamesForDate(dateString);
    if (games.some(game => game.gameType === 3)) await this.syncPlayoffSeriesForDate(dateString);
    let processed = 0;
    let skipped = 0;

    for (const game of games) {
      if (game.gameType !== 3) { skipped++; continue; }

      const away = game.awayTeam || {};
      const home = game.homeTeam || {};

      if (!away.id || !home.id) {
        console.warn(`[Playoff] Skipping game ${game.id}: missing team ID (away=${away.id}, home=${home.id})`);
        skipped++;
        continue;
      }

      const awayScore = away.score ?? 0;
      const homeScore = home.score ?? 0;

      const periodType = game.gameOutcome?.lastPeriodType || 'REG';
      const loserResult = periodType === 'OT' ? 'OTL' : periodType === 'SO' ? 'SOL' : 'L';

      let awayResult = loserResult;
      let homeResult = loserResult;
      if (awayScore > homeScore) { awayResult = 'W'; }
      else if (homeScore > awayScore) { homeResult = 'W'; }

      const awayTeam = await this.ensureTeamExists(away.id, away.abbrev, away.abbrev);
      const homeTeam = await this.ensureTeamExists(home.id, home.abbrev, home.abbrev);

      // Extract series context for tiebreaker queries
      const ss = game.seriesStatus || {};
      const seriesRound = ss.round || null;
      const seriesLetter = ss.seriesLetter || null;
      const startYear = Number(String(game.id).slice(0, 4));
      const season = game.season || startYear * 10000 + startYear + 1;
      let seriesId = null;
      let gameNumberInSeries = null;
      if (seriesRound && seriesLetter) {
        const roundMap = { 1: 'R1', 2: 'R2', 3: 'R3', 4: 'SCF' };
        const abbrev = roundMap[seriesRound] || 'R1';
        seriesId = `${String(season).slice(0, 4)}-${abbrev}-${seriesLetter}`;
      }
      if (ss.gameNumberOfSeries) {
        gameNumberInSeries = ss.gameNumberOfSeries;
      }

      const parsed = {
        gameId: game.id,
        gameDate: game.gameDate,
        gameState: game.gameState,
        startTimeUtc: game.startTimeUTC || null,
        away: { abbrev: away.abbrev, score: awayScore, logo: away.logo },
        home: { abbrev: home.abbrev, score: homeScore, logo: home.logo },
        result: ['OFF', 'FINAL'].includes(game.gameState) ? { awayResult, homeResult } : null,
        seriesId,
        round: seriesRound,
        gameNumberInSeries,
      };

      await this.storeBothPerspectives('games', 3, parsed, awayTeam.team_id, homeTeam.team_id);
      processed++;
    }

    if (processed > 0) await this.refreshStandingsAndPicks();
    return { date: dateString, processed, skipped };
  }

  // ---------------------------------------------------------------------------
  //  Playoff standings
  // ---------------------------------------------------------------------------

  async fetchAndStorePlayoffStandings(dateString) {
    const data = await this.fetchFromNhl(`/standings/${dateString}`);
    if (!data?.standings) {
      return { success: false, message: 'No standings data available', playoff_teams: [] };
    }

    let totalStored = 0;
    const playoffTeams = [];

    for (const s of data.standings) {
      const teamAbbrev = s.teamAbbrev?.default || '';
      const teamName = s.teamName?.default || '';
      const confSeq = s.conferenceSequence ?? 99;
      const isPlayoff = (s.divisionSequence >= 1 && s.divisionSequence <= 3)
        || (s.wildcardSequence >= 1 && s.wildcardSequence <= 2);

      // Look up nhl_api_id
      const lookup = await pool.query('SELECT nhl_api_id FROM nhl_teams WHERE abbreviation = $1', [teamAbbrev]);
      if (lookup.rows.length === 0) {
        console.warn(`⚠️  Team ${teamAbbrev} not in DB, skipping standings`);
        continue;
      }
      const nhlApiId = lookup.rows[0].nhl_api_id;

      await pool.query(
        `INSERT INTO playoff_standings (
          standings_date, team_abbrev, team_name, nhl_api_id,
          conference_name, conference_abbrev, conference_sequence,
          division_name, division_abbrev, division_sequence,
          wildcard_sequence, games_played, wins, losses, ot_losses,
          points, point_pctg, regulation_wins, goal_differential,
          goals_for, goals_against, is_playoff_team
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (standings_date, nhl_api_id)
        DO UPDATE SET
          team_abbrev=$2, team_name=$3, conference_name=$5, conference_abbrev=$6,
          conference_sequence=$7, division_name=$8, division_abbrev=$9, division_sequence=$10,
          wildcard_sequence=$11, games_played=$12, wins=$13, losses=$14, ot_losses=$15,
          points=$16, point_pctg=$17, regulation_wins=$18, goal_differential=$19,
          goals_for=$20, goals_against=$21, is_playoff_team=$22`,
        [
          dateString, teamAbbrev, teamName, nhlApiId,
          s.conferenceName || '', s.conferenceAbbrev || '', confSeq,
          s.divisionName || '', s.divisionAbbrev || '', s.divisionSequence || 0,
          s.wildcardSequence || 0, s.gamesPlayed || 0, s.wins || 0, s.losses || 0,
          s.otLosses || 0, s.points || 0, s.pointPctg || 0, s.regulationWins || 0,
          s.goalDifferential || 0, s.goalFor || 0, s.goalAgainst || 0, isPlayoff,
        ]
      );
      totalStored++;
      if (isPlayoff) {
        playoffTeams.push({ team_abbrev: teamAbbrev, conference: s.conferenceAbbrev, points: s.points || 0 });
      }
    }

    return { success: true, date: dateString, total_teams_stored: totalStored, playoff_teams: playoffTeams };
  }

  // ---------------------------------------------------------------------------
  //  Playoff series (extracted from game seriesStatus)
  // ---------------------------------------------------------------------------

  async syncPlayoffSeriesForDate(dateString) {
    const games = await this.fetchGamesForDate(dateString);
    const seriesSeen = {};
    let processed = 0;

    for (const game of games) {
      if (game.gameType !== 3 || !game.seriesStatus) continue;

      const ss = game.seriesStatus;
      const startYear = Number(String(game.id).slice(0, 4));
      const season = game.season || startYear * 10000 + startYear + 1;
      const round = ss.round || 1;
      const letter = ss.seriesLetter || 'A';
      const roundMap = { 1: 'R1', 2: 'R2', 3: 'R3', 4: 'SCF' };
      const abbrev = roundMap[round] || 'R1';
      const seriesId = `${String(season).slice(0, 4)}-${abbrev}-${letter}`;

      if (seriesSeen[seriesId]) continue;
      seriesSeen[seriesId] = true;

      const topAbbrev = ss.topSeedTeamAbbrev;
      const botAbbrev = ss.bottomSeedTeamAbbrev;
      const topWins = ss.topSeedWins || 0;
      const botWins = ss.bottomSeedWins || 0;

      const away = game.awayTeam || {};
      const home = game.homeTeam || {};
      const topNhlId = topAbbrev === away.abbrev ? away.id : home.id;
      const botNhlId = botAbbrev === away.abbrev ? away.id : home.id;

      const topTeam = await this.ensureTeamExists(topNhlId, topAbbrev, topAbbrev);
      const botTeam = await this.ensureTeamExists(botNhlId, botAbbrev, botAbbrev);

      const isCompleted = topWins >= 4 || botWins >= 4;
      let winnerDbId = null;
      if (isCompleted) {
        winnerDbId = topWins >= 4 ? topTeam.team_id : botTeam.team_id;
      }

      const roundTitleMap = { 1: '1st Round', 2: '2nd Round', 3: 'Conference Finals', 4: 'Stanley Cup Final' };

      await pool.query(
        `INSERT INTO playoff_series (
          series_id, season, round, series_abbrev, series_title, series_letter,
          top_seed_team_id, top_seed_team_abbrev, top_seed_wins,
          bottom_seed_team_id, bottom_seed_team_abbrev, bottom_seed_wins,
          needed_to_win, series_winner_id, is_completed
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (series_id) DO UPDATE SET
          top_seed_wins = GREATEST(playoff_series.top_seed_wins, EXCLUDED.top_seed_wins),
          bottom_seed_wins = GREATEST(playoff_series.bottom_seed_wins, EXCLUDED.bottom_seed_wins),
          series_winner_id = COALESCE(EXCLUDED.series_winner_id, playoff_series.series_winner_id),
          is_completed = playoff_series.is_completed OR EXCLUDED.is_completed,
          updated_at = CURRENT_TIMESTAMP`,
        [
          seriesId, season, round, abbrev, roundTitleMap[round] || '1st Round', letter,
          topTeam.team_id, topAbbrev, topWins,
          botTeam.team_id, botAbbrev, botWins,
          ss.neededToWin || 4, winnerDbId, isCompleted,
        ]
      );
      processed++;
    }

    return { date: dateString, series_processed: processed };
  }

  // ---------------------------------------------------------------------------
  //  Refresh standings materialized view + recalculate pick totals
  // ---------------------------------------------------------------------------

  async refreshStandingsAndPicks() {
    try {
      // CONCURRENTLY prevents locking the view during refresh (requires unique index)
      await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY team_standings');
      console.log('✅ Refreshed team_standings materialized view');
    } catch (err) {
      // Fall back to regular refresh if CONCURRENTLY fails (e.g., no unique index)
      if (err.message && err.message.includes('CONCURRENTLY')) {
        try {
          await pool.query('REFRESH MATERIALIZED VIEW team_standings');
          console.log('✅ Refreshed team_standings (non-concurrent fallback)');
        } catch (fallbackErr) {
          console.warn('⚠️  Could not refresh team_standings:', fallbackErr.message);
        }
      } else {
        console.warn('⚠️  Could not refresh team_standings:', err.message);
      }
    }

    try {
      await require('../models/TwoTeamPick').calculateAndUpdateAllWins();
      await require('../models/PlayoffPick').calculateAndUpdateAllWins();
      console.log('✅ Recalculated contest pick totals');
    } catch (err) {
      console.warn('⚠️  Could not recalculate pick totals:', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  //  Composite fetch operations
  // ---------------------------------------------------------------------------

  /**
   * Fetch all data types for a single date.
   */
  async fetchAllDataForDate(dateString) {
    const results = {};

    try { results.games = await this.processRegularSeasonGamesForDate(dateString); }
    catch (e) { results.games = { error: e.message }; }

    try { results.playoffStandings = await this.fetchAndStorePlayoffStandings(dateString); }
    catch (e) { results.playoffStandings = { error: e.message }; }

    try { results.playoffGames = await this.processPlayoffGamesForDate(dateString); }
    catch (e) { results.playoffGames = { error: e.message }; }

    try { results.playoffSeries = await this.syncPlayoffSeriesForDate(dateString); }
    catch (e) { results.playoffSeries = { error: e.message }; }

    return results;
  }

  /**
   * Fetch all data for today.
   */
  async fetchAllDataForToday() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`🔄 Fetching all NHL data for ${today}...`);
    return this.fetchAllDataForDate(today);
  }

  // ---------------------------------------------------------------------------
  //  Historical data (catch-up from season start)
  // ---------------------------------------------------------------------------

  async getSeasonStartDate() {
    try {
      const { rows } = await pool.query(
        "SELECT setting_value FROM settings WHERE setting_key = $1",
        ['season_start_date']
      );
      return rows[0]?.setting_value || new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }

  async fetchHistoricalData() {
    // A future schedule or a partial import is not proof that older results were fetched.
    return this.fetchHistoricalDataFull();
  }

  async fetchRecentDays(days = 7) {
    console.log(`🔄 Fetching last ${days} days...`);
    const results = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      try {
        const res = await this.fetchAllDataForDate(ds);
        results.push({ date: ds, ...res });
      } catch (err) {
        results.push({ date: ds, error: err.message });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  //  Purge all game data and re-fetch from season start
  // ---------------------------------------------------------------------------

  async purgeAndRefetchGames() {
    console.log('🗑️  [PURGE] Deleting all game data...');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete all games (regular season + playoff, unified in games table)
      const gamesResult = await client.query('DELETE FROM games');
      console.log(`🗑️  Deleted ${gamesResult.rowCount} rows from games`);

      // Delete all playoff standings
      const playoffStandingsResult = await client.query('DELETE FROM playoff_standings');
      console.log(`🗑️  Deleted ${playoffStandingsResult.rowCount} rows from playoff_standings`);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Refresh materialized view (will now show 0 wins since games are gone)
    await this.refreshStandingsAndPicks();

    // Re-fetch everything from season start (bypass resume logic)
    console.log('📚 [PURGE] Re-fetching all games from season start...');
    const result = await this.fetchHistoricalDataFull();

    console.log('✅ [PURGE] Complete');
    return result;
  }

  /**
   * Fetch historical data from season start WITHOUT resume logic.
   * Always starts from the configured season start date.
   */
  async fetchHistoricalDataFull() {
    const seasonStartStr = await this.getSeasonStartDate();
    const today = new Date().toISOString().split('T')[0];

    console.log(`📚 Fetching ALL historical data: ${seasonStartStr} → ${today}`);

    const start = new Date(seasonStartStr);
    const end = new Date(today);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (totalDays < 0) return { fetched: 0, errors: 0, daysProcessed: 0, message: 'Season not started yet' };

    let success = 0;
    let errors = 0;

    const BATCH_SIZE = 5;
    const dates = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
      const batch = dates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(ds => this.fetchAllDataForDate(ds))
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled' && !Object.values(results[j].value).some(part => part?.error || part?.success === false)) {
          success++;
        } else {
          errors++;
          console.error(`   ❌ ${batch[j]}: ${results[j].reason?.message || 'One or more NHL data requests failed'}`);
        }
      }

      if (i % 10 === 0) console.log(`   📅 ${batch[0]} (${i + 1}/${dates.length})`);

      if (i + BATCH_SIZE < dates.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`✅ Full historical fetch complete: ${success} ok, ${errors} errors`);
    return { fetched: success, errors, daysProcessed: totalDays + 1 };
  }

  // ---------------------------------------------------------------------------
  //  Health check (self-check, no external dependency)
  // ---------------------------------------------------------------------------

  async checkHealth() {
    try {
      await pool.query('SELECT 1');
      return { available: true, status: 'NHL Service OK (direct API)' };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }
}

// Singleton
const nhlService = new NhlService();
module.exports = nhlService;
