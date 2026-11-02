const cron = require('node-cron');
const SurvivorService = require('./survivorService');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const nhlService = require('./NhlService');

/**
 * Scheduler Service
 * Handles automated cron jobs for survivor contests and data fetching
 * 
 * NOTE: Cron errors are only logged to console. No alerting system exists.
 * Future improvement: add email/Slack notification on repeated failures.
 */

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.historicalDataFetched = false;
  }

  /**
   * Initialize and start all scheduled jobs
   */
  async start() {
    if (process.env.SCHEDULER_ENABLED === 'false') {
      console.log('Scheduler disabled by SCHEDULER_ENABLED');
      return;
    }
    if (this.isRunning) {
      console.log('⚠️  Scheduler is already running');
      return;
    }

    console.log('\n🕒 Starting Scheduler Service...');

    // Initialize email service
    try {
      await emailService.initialize();
      console.log('📧 Email service initialized');
    } catch (error) {
      console.error('⚠️  Email service initialization failed:', error.message);
    }

    // Initialize data fetch service
    try {
      await nhlService.initialize();
      console.log('🏒 NHL service initialized (direct API)');
    } catch (error) {
      console.error('⚠️  NHL service initialization failed:', error.message);
    }

    // Check database health
    try {
      const health = await nhlService.checkHealth();
      if (health.available) {
        console.log('✅ NHL service healthy');
      } else {
        console.warn('⚠️  NHL service unhealthy:', health.error);
      }
    } catch (error) {
      console.error('⚠️  Could not check NHL service health:', error.message);
    }

    // Job 1: Check and auto-advance weeks every hour
    // Runs at the top of every hour (e.g., 1:00, 2:00, 3:00, etc.)
    const autoAdvanceJob = cron.schedule('0 * * * *', async () => {
      console.log('\n⏰ [CRON] Running auto-advance check...');
      try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const nextWeek = new Date(`${today}T12:00:00Z`);
        nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
        await nhlService.fetchAndStoreScheduledGames(today, nextWeek.toISOString().slice(0, 10));
        const result = await SurvivorService.checkAndAutoAdvanceWeeks();
        await SurvivorService.checkAndAutoAdvancePlayoffs();
        
        if (result.contests_advanced > 0) {
          console.log(`\n🎉 [CRON] Advanced ${result.contests_advanced} contest(s)`);
        } else {
          console.log('\n✅ [CRON] No contests needed advancement');
        }
      } catch (error) {
        console.error('\n❌ [CRON] Auto-advance check failed:', error.message);
      }
    });

    this.jobs.push({
      name: 'auto-advance-weeks',
      schedule: '0 * * * *',
      description: 'Check and auto-advance survivor contest weeks every hour',
      job: autoAdvanceJob
    });

    // Job 2: Process pending notifications every 5 minutes
    const notificationJob = cron.schedule('*/5 * * * *', async () => {
      console.log('\n📧 [CRON] Processing pending notifications...');
      try {
        await notificationService.processPendingNotifications();
        console.log('✅ [CRON] Notification processing completed');
      } catch (error) {
        console.error('❌ [CRON] Notification processing failed:', error.message);
      }
    });

    this.jobs.push({
      name: 'process-notifications',
      schedule: '*/5 * * * *',
      description: 'Check and send pending email notifications every 5 minutes',
      job: notificationJob
    });

    // Job 3: Unified NHL data fetch every 10 minutes
    // Consolidates regular season, playoff games, playoff standings, and series
    // into a single cron job. The NHL API cache in NhlService ensures only 1 API
    // call per date even though multiple methods request the same data.
    // Only runs during likely game hours (15:00-06:00 UTC ≈ 11AM-2AM ET).
    const fetchAllGamesJob = cron.schedule('*/10 * * * *', async () => {
      const utcHour = new Date().getUTCHours();
      // NHL games typically run 11 AM - 1 AM ET (15:00 - 06:00 UTC)
      // Skip fetching during dead hours (06:00-15:00 UTC / 2AM-11AM ET)
      if (utcHour >= 6 && utcHour < 15) {
        return; // No games at this hour, skip to save API calls
      }

      console.log('\n🏒 [CRON] Fetching NHL data...');
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const yesterday = new Date(`${today}T12:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      try {
        const previousDate = yesterday.toISOString().slice(0, 10);
        await nhlService.processRegularSeasonGamesForDate(previousDate);
        await nhlService.processPlayoffGamesForDate(previousDate);
        const rsResult = await nhlService.processRegularSeasonGamesForDate(today);
        const poResult = await nhlService.processPlayoffGamesForDate(today);
        const seriesResult = await nhlService.syncPlayoffSeriesForDate(today);
        await SurvivorService.checkAndAutoAdvancePlayoffs();

        const totalProcessed = (rsResult.processed || 0) + (poResult.processed || 0);
        console.log(`✅ [CRON] Games: ${totalProcessed} processed (RS:${rsResult.processed}, PO:${poResult.processed}), Series:${seriesResult.series_processed}`);
      } catch (error) {
        console.error('❌ [CRON] NHL game data fetch failed:', error.message);
      }

      try {
        const standingsResult = await nhlService.fetchAndStorePlayoffStandings(today);
        if (standingsResult.success) {
          console.log(`✅ [CRON] Standings: ${standingsResult.total_teams_stored} teams`);
        }
      } catch (error) {
        console.error('❌ [CRON] Playoff standings fetch failed:', error.message);
      }
    });

    this.jobs.push({
      name: 'fetch-nhl-data',
      schedule: '*/10 * * * *',
      description: 'Fetch all NHL data every 10 minutes (game hours only: 11AM-2AM ET)',
      job: fetchAllGamesJob
    });

    this.isRunning = true;
    
    // Fetch historical data on startup (run in background, don't block startup)
    if (!this.historicalDataFetched) {
      console.log('\n📚 Scheduling historical data fetch...');
      setTimeout(async () => {
        try {
          await this.fetchHistoricalDataOnStartup();
        } catch (error) {
          console.error('❌ Historical data fetch failed:', error.message);
        }
      }, 5000); // Wait 5 seconds after startup to allow services to fully initialize
    }
    console.log(`✅ Scheduler started with ${this.jobs.length} job(s):`);
    this.jobs.forEach((job, index) => {
      console.log(`   ${index + 1}. ${job.name} - ${job.schedule}`);
      console.log(`      ${job.description}`);
    });
    console.log('');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Scheduler is not running');
      return;
    }

    console.log('\n🛑 Stopping Scheduler Service...');
    this.jobs.forEach(job => {
      job.job.stop();
    });
    this.isRunning = false;
    console.log('✅ Scheduler stopped\n');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.length,
      jobs: this.jobs.map(job => ({
        name: job.name,
        schedule: job.schedule,
        description: job.description,
        status: this.isRunning ? 'running' : 'stopped'
      }))
    };
  }

  /**
   * Manually trigger auto-advance check (for testing)
   */
  async triggerAutoAdvanceCheck() {
    console.log('\n🔧 [MANUAL] Triggering auto-advance check...');
    try {
      const result = await SurvivorService.checkAndAutoAdvanceWeeks();
      console.log('\n✅ [MANUAL] Check completed');
      return result;
    } catch (error) {
      console.error('\n❌ [MANUAL] Check failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch historical data on startup
   * Only fetches if not already fetched in this session
   */
  async fetchHistoricalDataOnStartup() {
    if (this.historicalDataFetched) {
      console.log('ℹ️  Historical data already fetched in this session');
      return;
    }

    console.log('\n📚 [STARTUP] Fetching historical data from season start...');
    
    try {
      const result = await nhlService.fetchHistoricalData();
      if (result.errors > 0) throw new Error(`NHL catch-up incomplete: ${result.errors} day(s) failed. Retry Historical Fetch in Admin → System.`);
      this.historicalDataFetched = true;
      
      console.log('\n✅ [STARTUP] Historical data fetch completed');
      console.log(`   Days processed: ${result.daysProcessed || 0}`);
      console.log(`   Successfully fetched: ${result.fetched || 0}`);
      console.log(`   Errors: ${result.errors || 0}`);
      
      return result;
    } catch (error) {
      console.error('\n❌ [STARTUP] Historical data fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger immediate data fetch for all endpoints
   */
  async triggerImmediateDataFetch() {
    console.log('\n🔧 [MANUAL] Triggering immediate data fetch...');
    try {
      const result = await nhlService.fetchAllDataForToday();
      console.log('\n✅ [MANUAL] Immediate fetch completed');
      return result;
    } catch (error) {
      console.error('\n❌ [MANUAL] Immediate fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger historical data fetch
   */
  async triggerHistoricalDataFetch() {
    console.log('\n🔧 [MANUAL] Triggering historical data fetch...');
    try {
      this.historicalDataFetched = false; // Reset flag to allow re-fetch
      const result = await this.fetchHistoricalDataOnStartup();
      console.log('\n✅ [MANUAL] Historical fetch completed');
      return result;
    } catch (error) {
      console.error('\n❌ [MANUAL] Historical fetch failed:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger recent days fetch
   */
  async triggerRecentDaysFetch(days = 7) {
    console.log(`\n🔧 [MANUAL] Triggering recent ${days} days fetch...`);
    try {
      const result = await nhlService.fetchRecentDays(days);
      console.log('\n✅ [MANUAL] Recent days fetch completed');
      return result;
    } catch (error) {
      console.error('\n❌ [MANUAL] Recent days fetch failed:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;

