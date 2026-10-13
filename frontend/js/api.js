// ── API Helper ─────────────────────────────────────────────
const API = {
  async request(method, url, body) {
    const controller = new AbortController();
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const timeout = setTimeout(() => controller.abort(), isFormData ? 180000 : 15000);
    const opts = {
      method,
      credentials: 'include',
      headers: isFormData ? {} : { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);
    try {
      const res = await fetch(url, opts);
      const text = await res.text();
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('The server returned a web page instead of API data. Restart the latest backend and refresh the app.');
      }
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('The server took too long to respond. Check that the backend and database are running, then try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Could not reach the server. Check that the backend is running and try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },

  get:    (url)       => API.request('GET',    url),
  post:   (url, body) => API.request('POST',   url, body),
  patch:  (url, body) => API.request('PATCH',  url, body),
  delete: (url)       => API.request('DELETE', url),

  // Auth
  login:    (data) => API.post('/api/auth/login', data),
  register: (data) => API.post('/api/auth/register', data),
  logout:   ()     => API.post('/api/auth/logout'),
  me:       ()     => API.get('/api/auth/me'),
  requestPasswordReset: (email) => API.post('/api/auth/forgot-password', { email }),
  resetPassword: (code, password) => API.post('/api/auth/reset-password', { code, password }),

  // Skills
  getMySkills:       ()     => API.get('/api/users/me/skills'),
  addOffered:        (data) => API.post('/api/users/me/skills/offered', data),
  deleteOffered:     (id)   => API.delete(`/api/users/me/skills/offered/${id}`),
  addRequested:      (data) => API.post('/api/users/me/skills/requested', data),
  deleteRequested:   (id)   => API.delete(`/api/users/me/skills/requested/${id}`),

  // Matches
  getMatches: () => API.get('/api/matches'),

  // Requests
  getRequests:   ()              => API.get('/api/requests'),
  sendRequest:   (data)          => API.post('/api/requests', data),
  cancelRequest: (id)             => API.delete(`/api/requests/${id}`),
  updateStatus:  (id, status)    => API.patch(`/api/requests/${id}/status`, { status }),

  // Ratings
  submitRating: (data)  => API.post('/api/ratings', data),
  leaderboard:  ()      => API.get('/api/ratings/leaderboard'),
  userRatings:  (id)    => API.get(`/api/ratings/user/${id}`),
  updateProfile: (data) => API.patch('/api/users/me/profile', data),
  uploadAvatar: (data) => API.post('/api/users/me/avatar', data),
};

// Session Notes (Idea 3)
API.getNotes      = (rid)  => API.get(`/api/notes/${rid}`);
API.addNote       = (rid, data) => API.post(`/api/notes/${rid}`, data);
API.deleteNote    = (id)   => API.delete(`/api/notes/entry/${id}`);

// Skill Completions (Idea 4)
API.myCompletions  = ()    => API.get('/api/completions/me');
API.myTaught       = ()    => API.get('/api/completions/taught');
API.compStats      = ()    => API.get('/api/completions/stats');
API.getStreak      = ()    => API.get('/api/streak');
API.getNotifications = () => API.get('/api/notifications');
API.readNotification = (id) => API.patch(`/api/notifications/${id}/read`);
API.readAllNotifications = () => API.post('/api/notifications/read-all');
