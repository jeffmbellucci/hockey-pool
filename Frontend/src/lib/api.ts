// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';

// NOTE: Token stored in localStorage is vulnerable to XSS. Accepted risk for a
// private 16-user pool app. Access token is short-lived (15 min); refresh token
// is already in an httpOnly cookie. A full httpOnly migration would require
// server-side token relay and is not justified for this threat model.
const TOKEN_KEY = 'hockey_pool_token';

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  lastName: string;
  role: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user: User;
  token: string;
}

export interface ApiError {
  success: false;
  message: string;
}

class ApiClient {
  private refreshInFlight: Promise<{ success: boolean; accessToken: string }> | null = null;
  private getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  private removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<T> {
    const token = this.getToken();

    const config: RequestInit = {
      credentials: 'include', // Important for cookies
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        // If 401 and not already retrying, attempt token refresh
        if (response.status === 401 && !isRetry && endpoint !== '/auth/refresh-token' && endpoint !== '/auth/login') {
          try {
            // Parallel page requests share one renewal; late 401s use an already renewed token.
            if (this.getToken() === token) await this.refreshToken();
            return this.request<T>(endpoint, options, true);
          } catch (refreshError) {
            // Refresh failed, clear auth
            this.removeToken();
            throw new Error(data.message || 'Invalid token. Authentication failed.');
          }
        }

        throw new Error(data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error. Please try again.');
    }
  }

  // ==================== AUTH ENDPOINTS ====================

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Store token
    if (response.token) {
      this.setToken(response.token);
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    name: string;
    lastName: string;
    role?: string;
  }): Promise<{ success: boolean; message: string; user: User }> {
    return this.request<{ success: boolean; message: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser(): Promise<{ success: boolean; user: User }> {
    return this.request<{ success: boolean; user: User }>('/users/me');
  }

  refreshToken(): Promise<{ success: boolean; accessToken: string }> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.request<{ success: boolean; accessToken: string }>(
        '/auth/refresh-token', { method: 'POST' }, true
      ).then(response => {
        if (!response.accessToken) throw new Error('Session renewal returned no access token');
        this.setToken(response.accessToken);
        return response;
      }).finally(() => { this.refreshInFlight = null; });
    }
    return this.refreshInFlight;
  }

  async logout(): Promise<{ success: boolean; message: string }> {
    const response = await this.request<{ success: boolean; message: string }>(
      '/auth/logout',
      { method: 'POST' }
    );

    // Clear token
    this.removeToken();

    return response;
  }

  async updateProfile(profileData: {
    name?: string;
    lastName?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<{ success: boolean; message: string; user: User }> {
    return this.request<{ success: boolean; message: string; user: User }>(
      '/users/profile',
      {
        method: 'PUT',
        body: JSON.stringify(profileData),
      }
    );
  }

  // ==================== ADMIN ENDPOINTS ====================

  async getAllUsers(): Promise<{ success: boolean; users: User[] }> {
    return this.request<{ success: boolean; users: User[] }>('/admin/users');
  }

  async createUser(userData: {
    email: string;
    password: string;
    name: string;
    lastName?: string;
    role?: string;
  }): Promise<{ success: boolean; message: string; user: User }> {
    return this.request<{ success: boolean; message: string; user: User }>(
      '/admin/users',
      {
        method: 'POST',
        body: JSON.stringify(userData),
      }
    );
  }

  async updateUser(
    userId: number,
    userData: {
      email?: string;
      password?: string;
      name?: string;
      lastName?: string;
      role?: string;
    }
  ): Promise<{ success: boolean; message: string; user: User }> {
    return this.request<{ success: boolean; message: string; user: User }>(
      `/admin/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(userData),
      }
    );
  }

  async deleteUser(userId: number): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/admin/users/${userId}`,
      {
        method: 'DELETE',
      }
    );
  }

  async updateUserStatus(
    userId: number,
    active: boolean
  ): Promise<{ success: boolean; message: string; user: User }> {
    return this.request<{ success: boolean; message: string; user: User }>(
      `/admin/users/${userId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }
    );
  }

  async getSettings(): Promise<{ success: boolean; settings: Record<string, string> }> {
    return this.request<{ success: boolean; settings: Record<string, string> }>(
      '/admin/settings'
    );
  }

  async updateSettings(settings: Record<string, string>): Promise<{
    success: boolean;
    message: string;
    settings: Record<string, string>;
  }> {
    return this.request<{
      success: boolean;
      message: string;
      settings: Record<string, string>;
    }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async getDashboardAnalytics(): Promise<{
    success: boolean;
    data: {
      seasonYear?: string | null;
      phase?: string | null;
      playoffRound?: number | null;
      playoffGame?: number | null;
      contestStatus?: string | null;
      currentWeek: number;
      gamesThisWeek: number;
      survivorAlive: number;
      totalParticipants: number;
      leader: {
        name: string;
        wins: number;
      };
      nextDeadline: string | null;
    };
  }> {
    return this.request<{
      success: boolean;
      data: {
        seasonYear?: string | null;
        phase?: string | null;
        playoffRound?: number | null;
        playoffGame?: number | null;
        contestStatus?: string | null;
        currentWeek: number;
        gamesThisWeek: number;
        survivorAlive: number;
        totalParticipants: number;
        leader: {
          name: string;
          wins: number;
        };
        nextDeadline: string | null;
      };
    }>('/contest/analytics');
  }

  // ==================== ADMIN SYSTEM ENDPOINTS ====================

  async getSchedulerStatus(): Promise<{ success: boolean; scheduler: any }> {
    return this.request<{ success: boolean; scheduler: any }>('/admin/scheduler/status');
  }

  async triggerDataFetchNow(): Promise<{ success: boolean; message: string; result: any }> {
    return this.request<{ success: boolean; message: string; result: any }>(
      '/admin/data/fetch-now',
      { method: 'POST' }
    );
  }

  async triggerHistoricalDataFetch(): Promise<{ success: boolean; message: string; result: any }> {
    return this.request<{ success: boolean; message: string; result: any }>(
      '/admin/data/fetch-historical',
      { method: 'POST' }
    );
  }

  async purgeAndRefetchGames(): Promise<{ success: boolean; message: string; result: any }> {
    return this.request<{ success: boolean; message: string; result: any }>(
      '/admin/data/purge-and-refetch',
      { method: 'POST' }
    );
  }

  async recalculateContestPoints(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      '/contest/picks/recalculate',
      { method: 'POST' }
    );
  }

  async triggerRecentDataFetch(days: number): Promise<{ success: boolean; message: string; result: any }> {
    return this.request<{ success: boolean; message: string; result: any }>(
      '/admin/data/fetch-recent',
      { method: 'POST', body: JSON.stringify({ days }) }
    );
  }

  async checkNhlApiHealth(): Promise<{ success: boolean; nhlApi: any }> {
    return this.request<{ success: boolean; nhlApi: any }>('/admin/data/api-health');
  }

  // ==================== ADMIN SURVIVOR OVERRIDE ENDPOINTS ====================

  async adminUpdateSurvivorPick(
    contestId: number,
    pickId: number,
    data: { team_id?: number; result?: string; games_won?: number; games_needed?: number }
  ): Promise<{ success: boolean; pick: any }> {
    return this.request<{ success: boolean; pick: any }>(
      `/admin/survivor/contests/${contestId}/picks/${pickId}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  }

  async adminUpdateParticipantStatus(
    contestId: number,
    participantId: number,
    data: { is_eliminated: boolean; elimination_week?: number; placement?: number }
  ): Promise<{ success: boolean; participant: any }> {
    return this.request<{ success: boolean; participant: any }>(
      `/admin/survivor/contests/${contestId}/participants/${participantId}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    );
  }

  async adminUpdateTiebreakerPick(
    contestId: number,
    pickId: number,
    data: { is_correct?: boolean | null; picked_team_id?: number; eliminate_participant?: boolean; reinstate_participant?: boolean }
  ): Promise<{ success: boolean; pick: any; participant?: any }> {
    return this.request<{ success: boolean; pick: any; participant?: any }>(
      `/admin/survivor/contests/${contestId}/tiebreaker/picks/${pickId}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
  }

  async adminUpdateContestState(
    contestId: number,
    data: { phase?: string; status?: string; current_week?: number; playoff_round?: number; playoff_game_number?: number }
  ): Promise<{ success: boolean; contest: any }> {
    return this.request<{ success: boolean; contest: any }>(
      `/admin/survivor/contests/${contestId}/state`,
      { method: 'PATCH', body: JSON.stringify(data) }
    );
  }

  // ==================== PLAYOFF STANDINGS ENDPOINTS ====================

  async getPlayoffStandings(date?: string): Promise<any> {
    const queryParam = date ? `?date=${date}` : '';
    return this.request<any>(`/playoff-standings${queryParam}`);
  }

  async getPlayoffTeams(date?: string): Promise<any> {
    const queryParam = date ? `?date=${date}` : '';
    return this.request<any>(`/playoff-standings/teams${queryParam}`);
  }

  async triggerPlayoffStandingsUpdate(): Promise<any> {
    return this.request<any>('/playoff-standings/update', {
      method: 'POST',
    });
  }

  async updatePlayoffStanding(standingsId: number, data: any): Promise<any> {
    return this.request<any>(`/playoff-standings/${standingsId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAvailableStandingsDates(): Promise<{ success: boolean; data: string[] }> {
    return this.request<{ success: boolean; data: string[] }>('/playoff-standings/dates');
  }

  async deletePlayoffStandings(date: string): Promise<any> {
    return this.request<any>(`/playoff-standings/${date}`, {
      method: 'DELETE',
    });
  }

  async getPlayoffAutoUpdateSettings(): Promise<any> {
    return this.request<any>('/playoff-standings/auto-update/settings');
  }

  async updatePlayoffAutoUpdateSettings(settings: { enabled?: boolean; intervalHours?: number }): Promise<any> {
    return this.request<any>('/playoff-standings/auto-update/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async checkPlayoffAutoUpdate(): Promise<any> {
    return this.request<any>('/playoff-standings/auto-update/check', {
      method: 'POST',
    });
  }

  // ==================== GAMES ENDPOINTS ====================

  async getAllGames(): Promise<any> {
    return this.request<any>('/games');
  }

  async getGamesByDateRange(startDate: string, endDate: string): Promise<any> {
    return this.request<any>(`/games/range?start=${startDate}&end=${endDate}`);
  }

  async getGamesByDate(date: string): Promise<any> {
    return this.request<any>(`/games/date/${date}`);
  }

  async getGame(gameId: number, teamId: number): Promise<any> {
    return this.request<any>(`/games/${gameId}/${teamId}`);
  }

  async updateGameScore(gameId: number, teamId: number, data: {
    team_score?: number;
    opponent_score?: number;
    result?: string;
    game_state?: string;
  }): Promise<any> {
    return this.request<any>(`/games/${gameId}/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async upsertGame(gameData: any): Promise<any> {
    return this.request<any>('/games', {
      method: 'POST',
      body: JSON.stringify(gameData),
    });
  }

  async deleteGame(gameId: number, teamId: number): Promise<any> {
    return this.request<any>(`/games/${gameId}/${teamId}`, {
      method: 'DELETE',
    });
  }

  // ==================== PLAYOFF GAMES ENDPOINTS ====================

  async getAllPlayoffGames(): Promise<any> {
    return this.request<any>('/playoff-games');
  }

  async getPlayoffGamesByDateRange(startDate: string, endDate: string): Promise<any> {
    return this.request<any>(`/playoff-games/range?start=${startDate}&end=${endDate}`);
  }

  async getPlayoffGamesByDate(date: string): Promise<any> {
    return this.request<any>(`/playoff-games/date/${date}`);
  }

  async getPlayoffGame(gameId: number, teamId: number): Promise<any> {
    return this.request<any>(`/playoff-games/${gameId}/${teamId}`);
  }

  async updatePlayoffGameScore(gameId: number, teamId: number, data: {
    team_score?: number;
    opponent_score?: number;
    result?: string;
    game_state?: string;
  }): Promise<any> {
    return this.request<any>(`/playoff-games/${gameId}/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async upsertPlayoffGame(gameData: any): Promise<any> {
    return this.request<any>('/playoff-games', {
      method: 'POST',
      body: JSON.stringify(gameData),
    });
  }

  async deletePlayoffGame(gameId: number, teamId: number): Promise<any> {
    return this.request<any>(`/playoff-games/${gameId}/${teamId}`, {
      method: 'DELETE',
    });
  }

  // ==================== SURVIVOR CONTEST ENDPOINTS ====================

  async getSurvivorContests(): Promise<any> {
    return this.request<any>('/survivor/contests');
  }

  async getSurvivorContest(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}`);
  }

  async createSurvivorContest(contestData: {
    contest_name: string;
    season_year: string;
    season_start_date: string;
    season_end_date: string;
    entry_fee?: number;
    prize_pool?: number;
    max_participants?: number;
  }): Promise<any> {
    return this.request<any>('/survivor/contests', {
      method: 'POST',
      body: JSON.stringify(contestData),
    });
  }

  async joinSurvivorContest(contestId: number, participantName?: string): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/join`, {
      method: 'POST',
      body: JSON.stringify({ participant_name: participantName }),
    });
  }

  async leaveSurvivorContest(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/leave`, {
      method: 'POST',
    });
  }

  async getSurvivorMyStatus(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/my-status`);
  }

  async getSurvivorParticipants(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/participants`);
  }

  async getSurvivorStandings(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/standings`);
  }

  async startSurvivorContest(contestId: number, startWeek = 1): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/start`, {
      method: 'POST',
      body: JSON.stringify({ start_week: startWeek }),
    });
  }

  async getSurvivorWeeks(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/weeks`);
  }

  async updateSurvivorWeeks(contestId: number, weeks: any[]): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/weeks`, {
      method: 'PUT',
      body: JSON.stringify({ weeks }),
    });
  }

  async getSurvivorAvailableTeams(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/available-teams`);
  }

  async submitSurvivorPick(contestId: number, weekNumber: number, teamId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/picks`, {
      method: 'POST',
      body: JSON.stringify({ week_number: weekNumber, team_id: teamId }),
    });
  }

  async getSurvivorWeekPicks(contestId: number, weekNumber: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/picks?week=${weekNumber}`);
  }

  async getSurvivorMyPicks(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/my-picks`);
  }

  async getSurvivorLockStatus(contestId: number, weekNumber?: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/lock-status${weekNumber ? `?week=${weekNumber}` : ''}`);
  }

  async getSurvivorWeekSchedule(contestId: number, weekNumber: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/week/${weekNumber}/schedule`);
  }

  // ==================== GENERIC HTTP METHODS ====================

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async updateSurvivorWeekLockTime(contestId: number, weekNumber: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/weeks/${weekNumber}/update-lock-time`, {
      method: 'POST',
    });
  }

  async updateAllSurvivorWeekLockTimes(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/update-all-lock-times`, {
      method: 'POST',
    });
  }

  async checkSurvivorWeekReadiness(contestId: number, weekNumber: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/weeks/${weekNumber}/readiness`);
  }

  async processSurvivorWeekResults(contestId: number, weekNumber: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/weeks/${weekNumber}/process-results`, {
      method: 'POST',
    });
  }

  async advanceSurvivorWeek(contestId: number): Promise<any> {
    return this.request<any>(`/survivor/contests/${contestId}/advance-week`, {
      method: 'POST',
    });
  }

  // ==================== NOTIFICATION ENDPOINTS ====================

  async getEmailSettings(): Promise<any> {
    return this.request<any>('/notifications/settings');
  }

  async checkMailjetConnection(): Promise<any> {
    return this.request<any>('/notifications/connection', { method: 'POST' });
  }

  async updateEmailSettings(settings: {
    enabled?: boolean;
    mailjet_api_key?: string;
    mailjet_api_secret?: string;
    from_email?: string;
    from_name?: string;
    app_url?: string;
    reminder_night_before_enabled?: boolean;
    reminder_night_before_time?: string;
    reminder_two_hours_enabled?: boolean;
  }): Promise<any> {
    return this.request<any>('/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async sendTestEmail(email: string, name?: string, sandbox = false): Promise<any> {
    return this.request<any>('/notifications/test-email', {
      method: 'POST',
      body: JSON.stringify({ email, name, sandbox }),
    });
  }

  async getUserNotificationPreferences(contestId?: number): Promise<any> {
    const endpoint = contestId
      ? `/notifications/preferences/${contestId}`
      : '/notifications/preferences';
    return this.request<any>(endpoint);
  }

  async updateUserNotificationPreferences(contestId: number, preferences: {
    email_reminders?: boolean;
    email_eliminations?: boolean;
    email_results?: boolean;
    email_advancement?: boolean;
  }): Promise<any> {
    return this.request<any>(`/notifications/preferences/${contestId}`, {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async getNotificationHistory(contestId: number, limit?: number): Promise<any> {
    const queryParam = limit ? `?limit=${limit}` : '';
    return this.request<any>(`/notifications/history/${contestId}${queryParam}`);
  }

  async processNotifications(): Promise<any> {
    return this.request<any>('/notifications/process', {
      method: 'POST',
    });
  }

  // ==================== UTILITY METHODS ====================

  clearAuth(): void {
    this.removeToken();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const api = new ApiClient();
