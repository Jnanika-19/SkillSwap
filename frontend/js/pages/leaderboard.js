async function loadLeaderboard() {
  const el = document.getElementById('page-leaderboard');
  el.innerHTML = loadingHTML();

  try {
    const { leaderboard } = await API.leaderboard();

    el.innerHTML = `
      <div class="page-header">
        <h1>Leaderboard</h1>
        <p>Top-rated students with completed swaps, ranked by average rating.</p>
      </div>
      <div class="card">
        ${leaderboard.length === 0
          ? `<div class="empty-state"><div class="empty-icon">&#9673;</div><p>Complete some swaps to appear here!</p></div>`
          : `<table class="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Department</th>
                  <th>Rating</th>
                  <th>Swaps</th>
                </tr>
              </thead>
              <tbody>
                ${leaderboard.map(u => {
                  const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  return `
                    <tr>
                      <td><span class="lb-rank ${u.rank_pos <= 3 ? 'top' : ''}">${u.rank_pos}</span></td>
                      <td>
                        <div class="flex gap-8">
                          ${avatarMarkup(u.profile_picture, initials, 'sm')}
                          <span style="font-weight:500">${escapeHTML(u.name)}${u.bio ? `<small class="lb-bio">${escapeHTML(u.bio)}</small>` : ''}</span>
                        </div>
                      </td>
                      <td class="muted">${escapeHTML(u.department || '-')}</td>
                      <td>${starsHTML(Math.round(u.avg_rating))} <span style="font-size:13px">${Number(u.avg_rating).toFixed(1)}</span></td>
                      <td style="font-weight:600">${u.swap_count}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="danger">Error: ${escapeHTML(err.message)}</p>`;
  }
}
