/**
 * CinePulse 250 - Custom Observatory Application Logic
 * Interactive Visualizations, Dynamic Filtering, and Custom Canvas Analytics
 */

// Application State
let allMovies = [];
let filteredMovies = [];
let favorites = new Set();
let activeEraFilter = 'all';
let activeCertFilter = 'all';
let activeDecadeChartFilter = null;
let currentViewMode = 'grid'; // 'grid' | 'table'

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  loadFavorites();
  initData();
  setupEventListeners();
  setupKeyboardShortcuts();
});

/* --------------------------------------------------------------------------
   Data Initialization
   -------------------------------------------------------------------------- */
function initData() {
  if (window.IMDB_DEFAULT_MOVIES && Array.isArray(window.IMDB_DEFAULT_MOVIES)) {
    allMovies = [...window.IMDB_DEFAULT_MOVIES];
  } else {
    // Fallback if data.js is loading via fetch
    fetch('../output/imdb_top_250_movies.csv')
      .then(res => res.text())
      .then(csvText => parseAndLoadCSV(csvText))
      .catch(err => console.warn('Could not auto-fetch CSV:', err));
  }
  
  if (allMovies.length > 0) {
    updateHeroMetrics();
    applyFilters();
    renderCharts();
  }
}

function updateHeroMetrics() {
  const total = allMovies.length;
  document.getElementById('statTotalMovies').textContent = total;

  // Average Rating
  const validRatings = allMovies.map(m => parseFloat(m.IMDb_Rating)).filter(r => !isNaN(r));
  const avg = validRatings.length ? (validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(2) : '8.31';
  document.getElementById('statAvgRating').textContent = avg;

  // Year Span
  const validYears = allMovies.map(m => parseInt(m.Release_Year)).filter(y => !isNaN(y));
  if (validYears.length) {
    const minYear = Math.min(...validYears);
    const maxYear = Math.max(...validYears);
    document.getElementById('statYearSpan').textContent = `${minYear} - ${maxYear}`;
  }

  // Top Ranked Film
  const topFilm = allMovies.find(m => m.Rank === 1 || m.Rank === '1') || allMovies[0];
  if (topFilm) {
    document.getElementById('statTopRankTitle').textContent = topFilm.Title;
  }
}

/* --------------------------------------------------------------------------
   Filtering & Sorting Engine
   -------------------------------------------------------------------------- */
function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const minRating = parseFloat(document.getElementById('ratingRange').value) || 8.0;
  const showOnlyFavorites = document.getElementById('favoritesFilterBtn').classList.contains('active-filter');

  filteredMovies = allMovies.filter(movie => {
    // Search query
    if (searchTerm) {
      const titleMatch = (movie.Title || '').toLowerCase().includes(searchTerm);
      const yearMatch = String(movie.Release_Year || '').includes(searchTerm);
      if (!titleMatch && !yearMatch) return false;
    }

    // Min Rating
    const movieRating = parseFloat(movie.IMDb_Rating);
    if (!isNaN(movieRating) && movieRating < minRating) return false;

    // Era filter
    const year = parseInt(movie.Release_Year);
    if (!isNaN(year)) {
      if (activeEraFilter === 'classic' && year > 1960) return false;
      if (activeEraFilter === 'vintage' && (year <= 1960 || year > 1989)) return false;
      if (activeEraFilter === 'modern' && (year <= 1989 || year > 2009)) return false;
      if (activeEraFilter === 'contemporary' && year <= 2009) return false;
    }

    // Chart Decade filter
    if (activeDecadeChartFilter) {
      const movieDecade = Math.floor(year / 10) * 10;
      if (movieDecade !== activeDecadeChartFilter) return false;
    }

    // Certification filter
    if (activeCertFilter !== 'all') {
      const cert = (movie.Content_Rating || '').trim();
      if (cert !== activeCertFilter) return false;
    }

    // Watchlist filter
    if (showOnlyFavorites) {
      if (!favorites.has(movie.URL || movie.Title)) return false;
    }

    return true;
  });

  sortFilteredMovies();
  renderCatalog();
}

function sortFilteredMovies() {
  const sortMode = document.getElementById('sortSelect').value;

  filteredMovies.sort((a, b) => {
    const rankA = parseInt(a.Rank) || 999;
    const rankB = parseInt(b.Rank) || 999;
    const ratingA = parseFloat(a.IMDb_Rating) || 0;
    const ratingB = parseFloat(b.IMDb_Rating) || 0;
    const yearA = parseInt(a.Release_Year) || 0;
    const yearB = parseInt(b.Release_Year) || 0;

    switch (sortMode) {
      case 'rank-asc': return rankA - rankB;
      case 'rank-desc': return rankB - rankA;
      case 'rating-desc': return ratingB - ratingA;
      case 'rating-asc': return ratingA - ratingB;
      case 'year-desc': return yearB - yearA;
      case 'year-asc': return yearA - yearB;
      case 'title-asc': return (a.Title || '').localeCompare(b.Title || '');
      default: return rankA - rankB;
    }
  });
}

/* --------------------------------------------------------------------------
   Rendering Catalog (Grid & Table)
   -------------------------------------------------------------------------- */
function renderCatalog() {
  const countEl = document.getElementById('resultsCount');
  countEl.textContent = `Showing ${filteredMovies.length} of ${allMovies.length} masterpieces`;

  const emptyState = document.getElementById('emptyState');
  const gridContainer = document.getElementById('moviesGrid');
  const tableContainer = document.getElementById('tableContainer');
  const tableBody = document.getElementById('tableBody');

  if (filteredMovies.length === 0) {
    gridContainer.style.display = 'none';
    tableContainer.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  if (currentViewMode === 'grid') {
    gridContainer.style.display = 'grid';
    tableContainer.style.display = 'none';
    renderGrid(gridContainer);
  } else {
    gridContainer.style.display = 'none';
    tableContainer.style.display = 'block';
    renderTable(tableBody);
  }
}

function renderGrid(container) {
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredMovies.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'movie-card glass-panel';
    const isFav = favorites.has(movie.URL || movie.Title);
    const rankNum = parseInt(movie.Rank) || 0;
    const isTop3 = rankNum >= 1 && rankNum <= 3;
    const ratingVal = parseFloat(movie.IMDb_Rating) || 8.0;
    const progressWidth = Math.min(100, Math.max(10, ((ratingVal - 7.0) / 3.0) * 100));

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="rank-badge ${isTop3 ? 'top-3-gold' : ''}">
            ${isTop3 ? '★' : '#'} ${movie.Rank}
          </span>
          <button class="favorite-btn ${isFav ? 'favorited' : ''}" data-id="${movie.URL || movie.Title}" title="Toggle Watchlist">
            <svg class="icon icon-heart" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>

        <h3 class="card-title">${escapeHTML(movie.Title)}</h3>

        <div class="card-meta-chips">
          <span class="chip">${movie.Release_Year || 'N/A'}</span>
          <span class="chip">${movie.Duration || 'N/A'}</span>
          <span class="chip chip-cert">${movie.Content_Rating || 'Unrated'}</span>
        </div>
      </div>

      <div class="card-rating-block">
        <div class="rating-row">
          <div class="rating-score">
            <span class="score-num">${!isNaN(ratingVal) ? ratingVal.toFixed(1) : 'N/A'}</span>
            <span class="score-max">/10</span>
          </div>
          <span class="vote-chip">
            <svg class="icon" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            ${movie.Vote_Count || 'N/A'}
          </span>
        </div>
        <div class="rating-progress-bar">
          <div class="rating-fill" style="width: ${progressWidth}%"></div>
        </div>
      </div>
    `;

    // Click card to open modal (unless clicked favorite button)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.favorite-btn')) return;
      openMovieModal(movie);
    });

    // Favorite button handler
    const favBtn = card.querySelector('.favorite-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(movie.URL || movie.Title);
      favBtn.classList.toggle('favorited');
      const heartSvg = favBtn.querySelector('svg');
      if (favBtn.classList.contains('favorited')) {
        heartSvg.setAttribute('fill', 'currentColor');
      } else {
        heartSvg.setAttribute('fill', 'none');
      }
    });

    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

function renderTable(tbody) {
  tbody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredMovies.forEach((movie, i) => {
    const tr = document.createElement('tr');
    const isFav = favorites.has(movie.URL || movie.Title);

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="table-rank">#${movie.Rank}</td>
      <td class="table-title">${escapeHTML(movie.Title)}</td>
      <td>${movie.Release_Year || 'N/A'}</td>
      <td class="table-rating">${movie.IMDb_Rating || 'N/A'}</td>
      <td>${movie.Duration || 'N/A'}</td>
      <td><span class="chip chip-cert">${movie.Content_Rating || 'Unrated'}</span></td>
      <td>${movie.Vote_Count || 'N/A'}</td>
      <td>
        <button class="btn btn-glass" style="padding:0.25rem 0.6rem;font-size:0.75rem;" onclick="openMovieModalByRank(${movie.Rank})">Inspect</button>
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

/* --------------------------------------------------------------------------
   Custom Canvas Visualizations (No Heavy External Libraries)
   -------------------------------------------------------------------------- */
function renderCharts() {
  drawDecadeChart();
  drawRatingDistributionChart();
  drawCertificateChart();
}

// 1. Decade Distribution Bar Chart
function drawDecadeChart() {
  const canvas = document.getElementById('decadeChart');
  if (!canvas) return;
  const ctx = setupCanvas(canvas);

  // Group movies by decade
  const decadeCounts = {};
  allMovies.forEach(m => {
    const year = parseInt(m.Release_Year);
    if (!isNaN(year)) {
      const decade = Math.floor(year / 10) * 10;
      decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
    }
  });

  const decades = Object.keys(decadeCounts).map(Number).sort((a, b) => a - b);
  const counts = decades.map(d => decadeCounts[d]);
  const maxCount = Math.max(...counts, 1);

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  const paddingLeft = 35;
  const paddingBottom = 25;
  const chartW = w - paddingLeft - 15;
  const chartH = h - paddingBottom - 15;

  const barWidth = Math.max(12, (chartW / decades.length) - 8);

  decades.forEach((decade, idx) => {
    const count = decadeCounts[decade];
    const barHeight = (count / maxCount) * chartH;
    const x = paddingLeft + (idx * (chartW / decades.length)) + 4;
    const y = h - paddingBottom - barHeight;

    const isSelected = activeDecadeChartFilter === decade;

    // Gradient Bar
    const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
    if (isSelected) {
      grad.addColorStop(0, '#f43f5e');
      grad.addColorStop(1, '#be123c');
    } else {
      grad.addColorStop(0, '#8b5cf6');
      grad.addColorStop(1, '#06b6d4');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
    ctx.fill();

    // Bar top value
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 10px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(count, x + barWidth / 2, y - 4);

    // Decade Label (e.g., '90s)
    ctx.fillStyle = isSelected ? '#f43f5e' : '#94a3b8';
    ctx.font = isSelected ? '700 11px Outfit' : '500 10px Outfit';
    ctx.fillText(`${String(decade).slice(2)}s`, x + barWidth / 2, h - 8);
  });

  // Canvas click to filter
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    decades.forEach((decade, idx) => {
      const x = paddingLeft + (idx * (chartW / decades.length));
      const nextX = paddingLeft + ((idx + 1) * (chartW / decades.length));
      if (clickX >= x && clickX <= nextX) {
        if (activeDecadeChartFilter === decade) {
          activeDecadeChartFilter = null;
          document.getElementById('resetChartFilterBtn').style.display = 'none';
        } else {
          activeDecadeChartFilter = decade;
          document.getElementById('resetChartFilterBtn').style.display = 'inline-block';
        }
        applyFilters();
        drawDecadeChart();
      }
    });
  };
}

// 2. Rating Density Spectrum Curve / Bars
function drawRatingDistributionChart() {
  const canvas = document.getElementById('ratingChart');
  if (!canvas) return;
  const ctx = setupCanvas(canvas);

  const buckets = { '8.0': 0, '8.1': 0, '8.2': 0, '8.3': 0, '8.4': 0, '8.5': 0, '8.6': 0, '8.7': 0, '8.8': 0, '8.9': 0, '9.0+': 0 };
  allMovies.forEach(m => {
    const r = parseFloat(m.IMDb_Rating);
    if (!isNaN(r)) {
      if (r >= 9.0) buckets['9.0+']++;
      else {
        const key = r.toFixed(1);
        if (buckets[key] !== undefined) buckets[key]++;
      }
    }
  });

  const keys = Object.keys(buckets);
  const values = Object.values(buckets);
  const maxVal = Math.max(...values, 1);

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  const paddingLeft = 30;
  const paddingBottom = 25;
  const chartW = w - paddingLeft - 10;
  const chartH = h - paddingBottom - 15;
  const barWidth = (chartW / keys.length) - 6;

  keys.forEach((key, idx) => {
    const val = buckets[key];
    const barH = (val / maxVal) * chartH;
    const x = paddingLeft + (idx * (chartW / keys.length));
    const y = h - paddingBottom - barH;

    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(1, '#3b82f6');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Value
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 9px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(val, x + barWidth / 2, y - 3);

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 9px Outfit';
    ctx.fillText(key, x + barWidth / 2, h - 8);
  });
}

// 3. Content Certification Donut Ring
function drawCertificateChart() {
  const canvas = document.getElementById('certChart');
  if (!canvas) return;
  const ctx = setupCanvas(canvas);

  const certCounts = {};
  allMovies.forEach(m => {
    const cert = (m.Content_Rating || 'Unrated').trim();
    certCounts[cert] = (certCounts[cert] || 0) + 1;
  });

  // Pick top 4 and combine others
  const sortedCerts = Object.entries(certCounts).sort((a, b) => b[1] - a[1]);
  const mainCerts = sortedCerts.slice(0, 4);
  const otherSum = sortedCerts.slice(4).reduce((acc, curr) => acc + curr[1], 0);
  if (otherSum > 0) mainCerts.push(['Others', otherSum]);

  const total = allMovies.length || 1;
  const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#64748b'];

  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  const centerX = w * 0.38;
  const centerY = h * 0.5;
  const radius = Math.min(centerX, centerY) - 15;
  const innerRadius = radius * 0.62;

  let startAngle = -Math.PI / 2;

  mainCerts.forEach(([cert, count], idx) => {
    const sliceAngle = (count / total) * (Math.PI * 2);
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fill();

    startAngle = endAngle;
  });

  // Center text
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOP 250', centerX, centerY - 8);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 10px Outfit';
  ctx.fillText('RATINGS', centerX, centerY + 10);

  // Legend on right
  const legendX = w * 0.68;
  let legendY = 35;
  mainCerts.forEach(([cert, count], idx) => {
    ctx.fillStyle = colors[idx % colors.length];
    ctx.beginPath();
    ctx.arc(legendX, legendY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 11px Outfit';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cert} (${count})`, legendX + 12, legendY);

    legendY += 28;
  });
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

/* --------------------------------------------------------------------------
   Modal Window Logic
   -------------------------------------------------------------------------- */
function openMovieModal(movie) {
  const modal = document.getElementById('movieModal');
  const body = document.getElementById('modalBody');
  const isFav = favorites.has(movie.URL || movie.Title);

  body.innerHTML = `
    <span class="modal-header-badge">OFFICIAL RANK #${movie.Rank} OF 250</span>
    <h2 class="modal-title">${escapeHTML(movie.Title)}</h2>

    <div class="modal-meta-grid">
      <div>
        <div class="meta-box-label">Release Year</div>
        <div class="meta-box-val">${movie.Release_Year || 'N/A'}</div>
      </div>
      <div>
        <div class="meta-box-label">IMDb Rating</div>
        <div class="meta-box-val" style="color:var(--accent-cyan);">${movie.IMDb_Rating || 'N/A'} / 10</div>
      </div>
      <div>
        <div class="meta-box-label">Runtime</div>
        <div class="meta-box-val">${movie.Duration || 'N/A'}</div>
      </div>
      <div>
        <div class="meta-box-label">Certification</div>
        <div class="meta-box-val">${movie.Content_Rating || 'Unrated'}</div>
      </div>
      <div>
        <div class="meta-box-label">Audience Votes</div>
        <div class="meta-box-val">${movie.Vote_Count || 'N/A'}</div>
      </div>
      <div>
        <div class="meta-box-label">Scraped At</div>
        <div class="meta-box-val" style="font-size:0.85rem;color:var(--text-muted);">${movie.Scraped_At || 'Recent'}</div>
      </div>
    </div>

    ${movie.Director && movie.Director !== 'N/A' ? `
      <div style="margin: 1rem 0;">
        <span style="color:var(--text-muted);font-size:0.85rem;">Director:</span>
        <strong style="color:var(--text-primary);margin-left:0.5rem;">${escapeHTML(movie.Director)}</strong>
      </div>
    ` : ''}

    ${movie.Cast && movie.Cast !== 'N/A' ? `
      <div style="margin: 0.5rem 0 1.5rem;">
        <span style="color:var(--text-muted);font-size:0.85rem;">Key Cast:</span>
        <span style="color:var(--text-secondary);margin-left:0.5rem;">${escapeHTML(movie.Cast)}</span>
      </div>
    ` : ''}

    <div class="modal-action-row">
      ${movie.URL && movie.URL !== 'N/A' ? `
        <a href="${movie.URL}" target="_blank" rel="noopener noreferrer" class="btn btn-glow">
          <span>View on IMDb</span>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      ` : ''}
      
      <button class="btn btn-glass" id="modalFavToggleBtn">
        <svg class="icon icon-heart" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span>${isFav ? 'In Watchlist' : 'Add to Watchlist'}</span>
      </button>
    </div>
  `;

  document.getElementById('modalFavToggleBtn').onclick = () => {
    toggleFavorite(movie.URL || movie.Title);
    openMovieModal(movie); // Re-render modal state
    renderCatalog();
  };

  modal.style.display = 'flex';
}

window.openMovieModalByRank = function(rank) {
  const m = allMovies.find(item => item.Rank == rank);
  if (m) openMovieModal(m);
};

/* --------------------------------------------------------------------------
   Surprise Film Roll
   -------------------------------------------------------------------------- */
function rollSurpriseMovie() {
  if (allMovies.length === 0) return;
  const randomIndex = Math.floor(Math.random() * allMovies.length);
  const picked = allMovies[randomIndex];

  const content = document.getElementById('surpriseModalContent');
  content.innerHTML = `
    <h3 style="font-family:var(--font-display);font-size:1.85rem;margin-bottom:0.75rem;color:#ffffff;">${escapeHTML(picked.Title)}</h3>
    <div style="display:flex;justify-content:center;gap:0.75rem;margin-bottom:1.25rem;">
      <span class="chip">Rank #${picked.Rank}</span>
      <span class="chip">${picked.Release_Year}</span>
      <span class="chip chip-cert">${picked.Content_Rating}</span>
      <span class="chip" style="color:var(--accent-cyan);font-weight:700;">★ ${picked.IMDb_Rating}</span>
    </div>
    <p style="color:var(--text-secondary);font-size:0.95rem;max-width:480px;margin:0 auto 1.5rem;">
      An all-time masterpiece with a runtime of <strong>${picked.Duration}</strong> and rated by over <strong>${picked.Vote_Count}</strong> film lovers.
    </p>
    ${picked.URL && picked.URL !== 'N/A' ? `
      <a href="${picked.URL}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="display:inline-flex;">
        Open IMDb Page &rarr;
      </a>
    ` : ''}
  `;

  document.getElementById('surpriseModal').style.display = 'flex';
}

/* --------------------------------------------------------------------------
   Watchlist & Favorites (localStorage)
   -------------------------------------------------------------------------- */
function loadFavorites() {
  try {
    const saved = localStorage.getItem('getmovies_favorites') || localStorage.getItem('cinepulse_favorites');
    if (saved) {
      favorites = new Set(JSON.parse(saved));
    }
  } catch (e) {
    favorites = new Set();
  }
  updateFavoritesBadge();
}

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
    showToast('Removed from Watchlist');
  } else {
    favorites.add(id);
    showToast('Saved to Watchlist');
  }
  localStorage.setItem('getmovies_favorites', JSON.stringify(Array.from(favorites)));
  updateFavoritesBadge();
}

function updateFavoritesBadge() {
  const badge = document.getElementById('favCountBadge');
  badge.textContent = favorites.size;
}

/* --------------------------------------------------------------------------
   CSV Import & Export Engine
   -------------------------------------------------------------------------- */
function exportFilteredToCSV() {
  if (filteredMovies.length === 0) {
    showToast('No movies to export');
    return;
  }

  const headers = ['Rank', 'Title', 'Release_Year', 'IMDb_Rating', 'Duration', 'Content_Rating', 'Vote_Count', 'URL'];
  const rows = [headers.join(',')];

  filteredMovies.forEach(m => {
    const row = headers.map(h => {
      let val = String(m[h] || '').replace(/"/g, '""');
      if (val.includes(',') || val.includes('"')) {
        val = `"${val}"`;
      }
      return val;
    });
    rows.push(row.join(','));
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(rows.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', `getmovies_top_250_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Exported ${filteredMovies.length} movies to CSV!`);
}

function parseAndLoadCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return;

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const parsed = [];

  for (let i = 1; i < lines.length; i++) {
    // Regex for CSV split handling quotes
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const matches = [];
    let match;
    while ((match = regex.exec(lines[i])) !== null) {
      if (match.index === regex.lastIndex) regex.lastIndex++;
      matches.push(match[1]);
    }

    if (matches.length >= headers.length) {
      const obj = {};
      headers.forEach((h, idx) => {
        let val = (matches[idx] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        obj[h] = val;
      });
      parsed.push(obj);
    }
  }

  if (parsed.length > 0) {
    allMovies = parsed;
    updateHeroMetrics();
    applyFilters();
    renderCharts();
    showToast(`Loaded ${parsed.length} movies successfully!`);
  }
}

/* --------------------------------------------------------------------------
   UI Event Listeners & Shortcuts
   -------------------------------------------------------------------------- */
function setupEventListeners() {
  // Search Input
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  searchInput.addEventListener('input', () => {
    clearBtn.style.display = searchInput.value ? 'block' : 'none';
    applyFilters();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    applyFilters();
    searchInput.focus();
  });

  // Rating Range Slider
  const ratingRange = document.getElementById('ratingRange');
  const ratingVal = document.getElementById('minRatingVal');
  ratingRange.addEventListener('input', () => {
    ratingVal.textContent = parseFloat(ratingRange.value).toFixed(1);
    applyFilters();
  });

  // Sort Selection
  document.getElementById('sortSelect').addEventListener('change', applyFilters);

  // Era Filter Pills
  document.querySelectorAll('#eraPillsContainer .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#eraPillsContainer .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeEraFilter = btn.dataset.era;
      applyFilters();
    });
  });

  // Certification Filter Chips
  document.querySelectorAll('#certPillsContainer .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#certPillsContainer .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeCertFilter = btn.dataset.cert;
      applyFilters();
    });
  });

  // View Mode Toggles
  const gridBtn = document.getElementById('viewGridBtn');
  const tableBtn = document.getElementById('viewTableBtn');
  gridBtn.addEventListener('click', () => {
    gridBtn.classList.add('active');
    tableBtn.classList.remove('active');
    currentViewMode = 'grid';
    renderCatalog();
  });
  tableBtn.addEventListener('click', () => {
    tableBtn.classList.add('active');
    gridBtn.classList.remove('active');
    currentViewMode = 'table';
    renderCatalog();
  });

  // Reset Decade Chart Filter
  document.getElementById('resetChartFilterBtn').addEventListener('click', () => {
    activeDecadeChartFilter = null;
    document.getElementById('resetChartFilterBtn').style.display = 'none';
    applyFilters();
    drawDecadeChart();
  });

  // Watchlist Filter Button in Navbar
  const favNavBtn = document.getElementById('favoritesFilterBtn');
  favNavBtn.addEventListener('click', () => {
    favNavBtn.classList.toggle('active-filter');
    if (favNavBtn.classList.contains('active-filter')) {
      favNavBtn.style.borderColor = 'var(--accent-rose)';
      showToast('Showing Watchlist only');
    } else {
      favNavBtn.style.borderColor = '';
      showToast('Showing all movies');
    }
    applyFilters();
  });

  // Surprise Modal
  document.getElementById('surpriseBtn').addEventListener('click', rollSurpriseMovie);
  document.getElementById('rollAgainBtn').addEventListener('click', rollSurpriseMovie);
  document.getElementById('closeSurpriseBtn').addEventListener('click', () => {
    document.getElementById('surpriseModal').style.display = 'none';
  });

  // Modal Closures
  document.getElementById('modalCloseBtn').addEventListener('click', () => {
    document.getElementById('movieModal').style.display = 'none';
  });
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
    }
  });

  // Reset Filters from Empty State
  document.getElementById('resetAllFiltersBtn').addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    ratingRange.value = 8.0;
    ratingVal.textContent = '8.0';
    document.querySelector('#eraPillsContainer [data-era="all"]').click();
    document.querySelector('#certPillsContainer [data-cert="all"]').click();
    activeDecadeChartFilter = null;
    document.getElementById('resetChartFilterBtn').style.display = 'none';
    favNavBtn.classList.remove('active-filter');
    favNavBtn.style.borderColor = '';
    applyFilters();
    drawDecadeChart();
  });

  // CSV Export & Upload
  document.getElementById('exportCsvBtn').addEventListener('click', exportFilteredToCSV);
  document.getElementById('csvFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => parseAndLoadCSV(event.target.result);
      reader.readAsText(file);
    }
  });

  // Window Resize: re-render charts
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 250);
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== document.getElementById('searchInput')) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    } else if (e.key === 'Escape') {
      document.getElementById('movieModal').style.display = 'none';
      document.getElementById('surpriseModal').style.display = 'none';
    }
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
