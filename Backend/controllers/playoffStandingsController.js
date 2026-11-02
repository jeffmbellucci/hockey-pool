const PlayoffStandings = require('../models/PlayoffStandings');
const Settings = require('../models/Settings');
const nhlService = require('../services/NhlService');

/**
 * Get playoff standings for a specific date or latest
 */
exports.getPlayoffStandings = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    let standings;
    if (date) {
      standings = await PlayoffStandings.getByDate(date);
    } else {
      standings = await PlayoffStandings.getLatest();
    }
    
    // Group by conference
    const eastern = standings.filter(s => s.conference_abbrev === 'E');
    const western = standings.filter(s => s.conference_abbrev === 'W');
    
    res.json({
      success: true,
      data: {
        standings,
        eastern,
        western,
        date: standings.length > 0 ? standings[0].standings_date : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get only playoff teams (top 16)
 */
exports.getPlayoffTeams = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    let teams;
    if (date) {
      teams = await PlayoffStandings.getPlayoffTeamsByDate(date);
    } else {
      const allStandings = await PlayoffStandings.getLatest();
      teams = allStandings.filter(s => s.is_playoff_team);
    }
    
    // Group by conference
    const eastern = teams.filter(t => t.conference_abbrev === 'E');
    const western = teams.filter(t => t.conference_abbrev === 'W');
    
    res.json({
      success: true,
      data: {
        teams,
        eastern,
        western,
        count: teams.length,
        date: teams.length > 0 ? teams[0].standings_date : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger NHL API to fetch and update playoff standings
 */
exports.triggerUpdate = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await nhlService.fetchAndStorePlayoffStandings(today);
    
    res.json({
      success: true,
      message: 'Playoff standings updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error triggering playoff standings update:', error.message);
    next(error);
  }
};

/**
 * Update a single playoff standing record
 */
exports.updateStanding = async (req, res, next) => {
  try {
    const { standingsId } = req.params;
    const updateData = req.body;
    
    const updated = await PlayoffStandings.update(standingsId, updateData);
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Playoff standing not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Playoff standing updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available dates
 */
exports.getAvailableDates = async (req, res, next) => {
  try {
    const dates = await PlayoffStandings.getAvailableDates();
    
    res.json({
      success: true,
      data: dates
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete standings for a specific date
 */
exports.deleteStandings = async (req, res, next) => {
  try {
    const { date } = req.params;
    
    await PlayoffStandings.deleteByDate(date);
    
    res.json({
      success: true,
      message: `Playoff standings for ${date} deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get auto-update settings
 */
exports.getAutoUpdateSettings = async (req, res, next) => {
  try {
    const enabled = await Settings.get('playoff_auto_update_enabled');
    const interval = await Settings.get('playoff_auto_update_interval_hours');
    const lastUpdate = await Settings.get('playoff_last_auto_update');
    
    res.json({
      success: true,
      data: {
        enabled: enabled === 'true',
        intervalHours: parseInt(interval) || 24,
        lastUpdate: lastUpdate || null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update auto-update settings
 */
exports.updateAutoUpdateSettings = async (req, res, next) => {
  try {
    const { enabled, intervalHours } = req.body;
    
    if (typeof enabled !== 'undefined') {
      await Settings.set('playoff_auto_update_enabled', enabled.toString());
    }
    
    if (intervalHours) {
      const hours = parseInt(intervalHours);
      if (hours < 1) {
        return res.status(400).json({
          success: false,
          error: 'Interval must be at least 1 hour'
        });
      }
      await Settings.set('playoff_auto_update_interval_hours', hours.toString());
    }
    
    res.json({
      success: true,
      message: 'Auto-update settings updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if auto-update should run and trigger if needed
 */
exports.checkAndRunAutoUpdate = async (req, res, next) => {
  try {
    const enabled = await Settings.get('playoff_auto_update_enabled');
    
    if (enabled !== 'true') {
      return res.json({
        success: true,
        message: 'Auto-update is disabled',
        shouldUpdate: false
      });
    }
    
    const intervalHours = parseInt(await Settings.get('playoff_auto_update_interval_hours')) || 24;
    const lastUpdate = await Settings.get('playoff_last_auto_update');
    
    let shouldUpdate = false;
    
    if (!lastUpdate) {
      shouldUpdate = true;
    } else {
      const lastUpdateTime = new Date(lastUpdate);
      const now = new Date();
      const hoursSinceUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);
      
      shouldUpdate = hoursSinceUpdate >= intervalHours;
    }
    
    if (shouldUpdate) {
      // Trigger update
      try {
        const today = new Date().toISOString().split('T')[0];
        const result = await nhlService.fetchAndStorePlayoffStandings(today);
        
        // Update last update timestamp
        await Settings.set('playoff_last_auto_update', new Date().toISOString());
        
        return res.json({
          success: true,
          message: 'Auto-update completed successfully',
          shouldUpdate: true,
          data: result
        });
      } catch (error) {
        console.error('Auto-update failed:', error.message);
        return res.status(500).json({
          success: false,
          error: 'Auto-update failed: ' + error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Auto-update not needed yet',
      shouldUpdate: false,
      nextUpdate: lastUpdate ? new Date(new Date(lastUpdate).getTime() + intervalHours * 60 * 60 * 1000) : null
    });
  } catch (error) {
    next(error);
  }
};

