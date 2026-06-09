/**
 * Smart Parking System - Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = {
    spots: [],
    reservations: [],
    logs: [],
    simulationActive: true,
    simulationSpeed: 'medium', // slow, medium, fast
    arrivalBias: 50, // percent
    totalRevenue: 0.0,
    hourlyRevenueHistory: [120, 180, 240, 310, 290, 350, 420, 480, 520, 490, 450, 470],
    occupancyTrendHistory: [35, 42, 50, 62, 70, 75, 80, 85, 78, 65, 55, 48, 45, 50, 58, 64, 72, 79, 82, 85, 76, 60, 44, 38],
    currentView: 'dashboard',
    currentFloor: 1,
    selectedSpotId: null,
    simulationTimer: null,
    revenueRates: {
      standard: 25.0,
      ev: 35.0,
      accessible: 20.0,
      motorcycle: 15.0
    }
  };

  // --- INITIALIZATION ---
  initSpots();
  setupEventListeners();
  startClock();
  startSimulation();
  renderDashboard();
  renderLotView();
  updateBookingSpotOptions();
  renderAnalyticsCharts();

  // --- 1. SPOT INITIALIZATION ---
  function initSpots() {
    // Generate 24 spots per floor (Total 72 spots)
    // Floor 1 (P1): A01 - A24
    // Floor 2 (P2): B01 - B24
    // Floor 3 (P3): C01 - C24
    const floorLetters = { 1: 'A', 2: 'B', 3: 'C' };

    for (let f = 1; f <= 3; f++) {
      const letter = floorLetters[f];
      for (let s = 1; s <= 24; s++) {
        const idNum = s.toString().padStart(2, '0');
        const id = `${letter}${idNum}`;
        let type = 'standard';
        
        // Define spot types by layout rules
        if (f === 1) {
          if (s <= 4) type = 'accessible';
          else if (s <= 8) type = 'ev';
          else if (s <= 12) type = 'motorcycle';
        } else if (f === 2) {
          if (s <= 2) type = 'accessible';
          else if (s <= 6) type = 'ev';
        } else if (f === 3) {
          if (s <= 2) type = 'accessible';
        }

        // Setup mock initial states
        let status = 'available';
        let occupant = null;
        
        // Populate ~40% of the spots randomly at start
        if (Math.random() < 0.45) {
          status = type === 'ev' && Math.random() < 0.5 ? 'charging' : 'occupied';
          const mockDriver = getRandomDriver();
          const rate = state.revenueRates[type];
          const hoursParked = Math.floor(Math.random() * 4) + 1;
          occupant = {
            name: mockDriver.name,
            plate: mockDriver.plate,
            parkedAt: new Date(Date.now() - hoursParked * 60 * 60 * 1000),
            targetDuration: Math.floor(Math.random() * 6) + 1,
            rate: rate,
            accumulatedRevenue: hoursParked * rate
          };
          state.totalRevenue += occupant.accumulatedRevenue;
        }

        state.spots.push({
          id,
          floor: f,
          type,
          status,
          occupant
        });
      }
    }
    
    addLog('Otopark sistemi başarıyla başlatıldı. Toplam kapasite: 72 araç.', 'success');
  }

  // --- 2. EVENT LISTENERS ---
  function setupEventListeners() {
    // Navigation Tabs Switching
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = btn.getAttribute('data-view');
        switchView(view);
      });
    });

    // Floor Tabs Switching
    document.querySelectorAll('.floor-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.floor-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentFloor = parseInt(btn.getAttribute('data-floor'));
        renderLotView();
      });
    });

    // Spot Type Filter
    document.getElementById('spot-type-filter').addEventListener('change', (e) => {
      renderLotView();
    });

    // Reservation Driver Type reactive selector
    document.getElementById('book-vehicle-type').addEventListener('change', () => {
      updateBookingSpotOptions();
    });

    // Reservation Floor reactive selector
    document.getElementById('book-floor').addEventListener('change', () => {
      updateBookingSpotOptions();
    });

    // Recommendation Button
    document.getElementById('recommender-btn').addEventListener('click', () => {
      suggestOptimalSpot();
    });

    // Booking Form Submission
    document.getElementById('booking-form').addEventListener('submit', (e) => {
      e.preventDefault();
      handleReservationSubmit();
    });

    // Simulation Toggle
    const simCheckbox = document.getElementById('sim-toggle-check');
    simCheckbox.addEventListener('change', (e) => {
      state.simulationActive = e.target.checked;
      const badge = document.getElementById('global-sim-badge');
      const badgeTxt = document.getElementById('global-sim-badge-txt');
      
      if (state.simulationActive) {
        badge.classList.remove('inactive');
        badgeTxt.textContent = 'Simülasyon Aktif';
        addLog('Otomatik simülatör akışı başlatıldı.', 'info');
        startSimulation();
      } else {
        badge.classList.add('inactive');
        badgeTxt.textContent = 'Simülasyon Durduruldu';
        addLog('Otomatik simülatör akışı durduruldu.', 'warning');
        clearInterval(state.simulationTimer);
      }
    });

    // Simulation Speed Group
    document.querySelectorAll('#sim-speed-group .speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sim-speed-group .speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.simulationSpeed = btn.getAttribute('data-speed');
        addLog(`Simülasyon hızı değiştirildi: ${btn.textContent}`, 'info');
        if (state.simulationActive) {
          clearInterval(state.simulationTimer);
          startSimulation();
        }
      });
    });

    // Simulation Arrival Bias Slider
    const biasSlider = document.getElementById('sim-arrival-bias');
    const biasVal = document.getElementById('sim-arrival-bias-val');
    biasSlider.addEventListener('input', (e) => {
      state.arrivalBias = parseInt(e.target.value);
      biasVal.textContent = `${state.arrivalBias}%`;
    });

    // Manual Entry Triggers
    document.getElementById('btn-manual-arrive').addEventListener('click', () => {
      simulateManualVehicleArrival();
    });

    document.getElementById('btn-manual-depart').addEventListener('click', () => {
      simulateManualVehicleDeparture();
    });

    // System Reset
    document.getElementById('btn-reset-system').addEventListener('click', () => {
      if (confirm('Tüm otopark durumunu sıfırlamak ve ciroları temizlemek istediğinize emin misiniz?')) {
        resetSystemData();
      }
    });

    // Clear Logs Button
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
      state.logs = [];
      const container = document.getElementById('log-feed');
      container.innerHTML = `<div style="color: var(--text-muted); text-align: center; margin-top: 50px;">Günlük temizlendi.</div>`;
    });
  }

  // --- 3. VIEW CONTROLLER (SPA TAB NAVIGATION) ---
  function switchView(viewName) {
    state.currentView = viewName;
    
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update View Panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      if (panel.id === `view-${viewName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Set View Title in Header
    const titles = {
      dashboard: 'Gösterge Paneli',
      'lot-view': 'Otopark Kat Yerleşim Haritası',
      reservations: 'Akıllı Rezervasyon Sistemi',
      analytics: 'Detaylı Otopark Analiz Raporu',
      'simulation-settings': 'Simülasyon Denetim Konsolu'
    };
    document.getElementById('view-title').textContent = titles[viewName] || 'SmartPark Pro';

    // View-specific trigger updates
    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'lot-view') {
      renderLotView();
    } else if (viewName === 'reservations') {
      updateBookingSpotOptions();
    } else if (viewName === 'analytics') {
      renderAnalyticsCharts();
    }
  }

  // --- 4. CLOCK MODULE ---
  function startClock() {
    const clockEl = document.querySelector('#clock-display span');
    setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('tr-TR', { hour12: false });
      clockEl.textContent = timeStr;
    }, 1000);
  }

  // --- 5. SYSTEM LOGGER ---
  function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const logItem = { message, type, time: timestamp };
    
    state.logs.unshift(logItem);
    if (state.logs.length > 50) state.logs.pop(); // Cap log count

    // Append to dashboard log container if we are viewing it
    const logFeed = document.getElementById('log-feed');
    if (logFeed) {
      // Clear empty text if present
      if (logFeed.innerHTML.includes('Günlük temizlendi')) {
        logFeed.innerHTML = '';
      }
      
      const newLogHtml = `
        <div class="log-item">
          <div class="log-dot ${type}"></div>
          <div class="log-content">
            <div class="log-header-row">
              <span class="log-message">${message}</span>
              <span class="log-time">${timestamp}</span>
            </div>
          </div>
        </div>
      `;
      logFeed.insertAdjacentHTML('afterbegin', newLogHtml);
      
      // Limit DOM children to match array length
      while (logFeed.children.length > 50) {
        logFeed.removeChild(logFeed.lastChild);
      }
    }
  }

  // --- 6. DASHBOARD RENDERING ---
  function renderDashboard() {
    const stats = calculateStats();
    
    // Update KPI Card Numbers
    document.getElementById('stats-capacity').textContent = stats.capacity;
    document.getElementById('stats-available').textContent = stats.available;
    document.getElementById('stats-occupied').textContent = stats.occupied;
    document.getElementById('stats-reserved').textContent = stats.reserved;
    document.getElementById('stats-revenue').textContent = `₺${state.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const rateText = document.getElementById('stats-occupancy-rate');
    rateText.textContent = `${stats.occupancyPercent}%`;

    // Render Occupancy Gauge SVG
    const dashoffset = 502 - (502 * stats.occupancyPercent) / 100;
    const gaugeFill = document.getElementById('occupancy-gauge-fill');
    if (gaugeFill) {
      gaugeFill.style.strokeDashoffset = dashoffset;
    }
    
    const percentText = document.getElementById('gauge-percent-text');
    if (percentText) {
      percentText.textContent = `${stats.occupancyPercent}%`;
    }

    // Gauge Summary Stats below it
    document.getElementById('gauge-stat-ev').textContent = `${stats.occupiedEv}/${stats.capacityEv}`;
    document.getElementById('gauge-stat-hc').textContent = `${stats.occupiedHc}/${stats.capacityHc}`;
    document.getElementById('gauge-stat-mc').textContent = `${stats.occupiedMc}/${stats.capacityMc}`;

    // Populate Initial Log List on dashboard load
    const logFeed = document.getElementById('log-feed');
    if (logFeed && logFeed.children.length === 0 && state.logs.length > 0) {
      logFeed.innerHTML = state.logs.map(log => `
        <div class="log-item">
          <div class="log-dot ${log.type}"></div>
          <div class="log-content">
            <div class="log-header-row">
              <span class="log-message">${log.message}</span>
              <span class="log-time">${log.time}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // --- 7. INTERACTIVE LOT MAP RENDERING ---
  function renderLotView() {
    const gridContainer = document.getElementById('parking-spots-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';
    
    const filterType = document.getElementById('spot-type-filter').value;
    
    // Filter spots by floor and selected vehicle type filter
    const floorSpots = state.spots.filter(spot => {
      const matchFloor = spot.floor === state.currentFloor;
      const matchType = filterType === 'all' || 
                        (filterType === 'standard' && spot.type === 'standard') ||
                        (filterType === 'ev' && spot.type === 'ev') ||
                        (filterType === 'accessible' && spot.type === 'accessible') ||
                        (filterType === 'motorcycle' && spot.type === 'motorcycle');
      return matchFloor && matchType;
    });

    if (floorSpots.length === 0) {
      gridContainer.innerHTML = `<div style="grid-column: span 6; text-align: center; color: var(--text-secondary); margin-top: 50px;">Bu tipte park yeri bulunamadı.</div>`;
      return;
    }

    floorSpots.forEach(spot => {
      const isSelected = state.selectedSpotId === spot.id;
      
      const spotEl = document.createElement('div');
      spotEl.className = `parking-spot ${spot.status} ${isSelected ? 'selected' : ''}`;
      spotEl.setAttribute('data-id', spot.id);
      
      // Determine Type label
      const typeLabels = { standard: 'STD', ev: '⚡ EV', accessible: '♿ ENG', motorcycle: '🏍️ MOT' };
      const typeClasses = { standard: 'std', ev: 'ev', accessible: 'hc', motorcycle: 'mc' };
      
      // Render beautiful graphic details
      spotEl.innerHTML = `
        <div class="spot-indicator">
          <span class="spot-id">${spot.id}</span>
          <span class="spot-badge ${typeClasses[spot.type]}">${typeLabels[spot.type]}</span>
        </div>
        <div class="spot-car-model">
          ${getCarSvg(spot.type)}
        </div>
        <div class="spot-state-text">${translateStatus(spot.status)}</div>
      `;

      spotEl.addEventListener('click', () => {
        selectSpot(spot.id);
      });

      gridContainer.appendChild(spotEl);
    });

    // Re-select / Render Detail Panel
    updateDetailPanel();
  }

  // Helper to generate inline car SVGs based on category
  function getCarSvg(type) {
    if (type === 'motorcycle') {
      return `
        <svg viewBox="0 0 24 24" width="40" height="40">
          <path d="M19 8.5c.83 0 1.5-.67 1.5-1.5S19.83 5.5 19 5.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM19 10c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm-9.35-1.41L7.54 11H3v2h3.58l1.41 2.82C8.36 16.54 9.13 17 10 17h3v-2h-3l-1.5-3L9.65 8.59zM15 17c0-1.66-1.34-3-3-3s-3 1.34-3 3 1.34 3 3 3 3-1.34 3-3z"/>
        </svg>
      `;
    }
    
    // Normal Car SVG
    return `
      <svg viewBox="0 0 512 512">
        <path d="M495.2 260.6c-18.1-13.6-41.5-20.6-65.2-20.6H82c-23.7 0-47.1 7-65.2 20.6C6.5 268.4 0 282.4 0 297.2v72.3C0 393.5 18.5 412 41.3 412h17.9c12.3 0 23.3-8.1 26.3-20.1L96 352h320l10.5 39.9c3 12 14 20.1 26.3 20.1h17.9c22.8 0 41.3-18.5 41.3-42.5v-72.3c0-14.8-6.5-28.8-16.8-36.6zM128 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm256 0c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zM380.2 92.4C371 67.9 347.6 52 321.4 52H190.6c-26.2 0-49.6 15.9-58.8 40.4L96 192h320l-35.8-99.6z"/>
      </svg>
    `;
  }

  function translateStatus(status) {
    const statuses = {
      available: 'BOŞ',
      occupied: 'DOLU',
      reserved: 'REZERVE',
      charging: 'ŞARJDA'
    };
    return statuses[status] || status;
  }

  // --- 8. SPOT DETAILS PANEL ---
  function selectSpot(spotId) {
    state.selectedSpotId = spotId;
    
    // Re-render lot grid to highlight the spot
    document.querySelectorAll('.parking-spot').forEach(spotEl => {
      if (spotEl.getAttribute('data-id') === spotId) {
        spotEl.classList.add('selected');
      } else {
        spotEl.classList.remove('selected');
      }
    });

    updateDetailPanel();
  }

  function updateDetailPanel() {
    const detailBody = document.getElementById('details-panel-body');
    const spotName = document.getElementById('detail-spot-name');
    
    if (!state.selectedSpotId) {
      spotName.textContent = 'Seçiniz';
      detailBody.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; margin-top: 50px;">
          Detayları görüntülemek ve işlem yapmak için bir park yeri seçin.
        </div>
      `;
      return;
    }

    const spot = state.spots.find(s => s.id === state.selectedSpotId);
    if (!spot) return;

    spotName.textContent = spot.id;
    
    const typeLabel = { standard: 'Standart Binek', ev: 'Elektrikli Şarj Noktası', accessible: 'Engelli Öncelikli', motorcycle: 'Motosiklet Yeri' }[spot.type];
    const statusLabels = { available: 'Mevcut (Boş)', occupied: 'Dolu (Park Edilmiş)', reserved: 'Rezerve Edilmiş', charging: 'Araç Şarj Ediliyor' };
    const statusPillClass = { available: 'status-available', occupied: 'status-occupied', reserved: 'status-reserved', charging: 'status-charging' }[spot.status];
    
    let occupantDetails = '';
    let controlButtons = '';

    if (spot.status === 'available') {
      occupantDetails = `
        <div style="color: var(--text-muted); text-align: center; padding: 20px 0; border: 1px dashed var(--border-light); border-radius: var(--border-radius-sm);">
          Park yeri şu an boş.
        </div>
      `;
      controlButtons = `
        <button class="btn btn-success" id="detail-action-park">Araç Park Et</button>
        <button class="btn btn-primary" id="detail-action-reserve">Yer Ayırt (Rezerve Et)</button>
      `;
    } else {
      const nameVal = spot.occupant ? spot.occupant.name : 'Simüle Sürücü';
      const plateVal = spot.occupant ? spot.occupant.plate : 'MOCK-PLT-34';
      const durationVal = spot.occupant ? getDurationString(spot.occupant.parkedAt) : '10 dk';
      const revVal = spot.occupant ? spot.occupant.accumulatedRevenue.toFixed(2) : '0.00';

      occupantDetails = `
        <div class="detail-group">
          <div class="detail-lbl">Sürücü Bilgisi</div>
          <div class="detail-val" style="font-weight:600;">${nameVal}</div>
        </div>
        <div class="detail-group">
          <div class="detail-lbl">Araç Plakası</div>
          <div class="detail-val" style="font-family: monospace; font-size:1.1rem; color:var(--accent-blue);">${plateVal}</div>
        </div>
        <div class="detail-group">
          <div class="detail-lbl">Park Süresi</div>
          <div class="detail-val">${durationVal}</div>
        </div>
        <div class="detail-group">
          <div class="detail-lbl">Biriken Ücret</div>
          <div class="detail-val" style="color: var(--accent-green); font-size:1.15rem; font-weight:700;">₺${revVal}</div>
        </div>
      `;

      controlButtons = `
        <button class="btn btn-danger" id="detail-action-release">Park Yerini Boşalt (Çıkış)</button>
      `;
    }

    detailBody.innerHTML = `
      <div class="detail-group">
        <div class="detail-lbl">Park Alanı Tipi</div>
        <div class="detail-val">${typeLabel}</div>
      </div>

      <div class="detail-group">
        <div class="detail-lbl">Mevcut Durum</div>
        <div class="detail-status-pill ${statusPillClass}">${statusLabels[spot.status]}</div>
      </div>

      ${occupantDetails}

      <div class="spot-controls">
        ${controlButtons}
      </div>
    `;

    // Attach button actions reactive listeners
    if (spot.status === 'available') {
      document.getElementById('detail-action-park').addEventListener('click', () => {
        manuallyParkInSpot(spot.id);
      });
      document.getElementById('detail-action-reserve').addEventListener('click', () => {
        manuallyReserveSpot(spot.id);
      });
    } else {
      document.getElementById('detail-action-release').addEventListener('click', () => {
        manuallyVacateSpot(spot.id);
      });
    }
  }

  function getDurationString(startTime) {
    if (!startTime) return '00:00';
    const diffMs = Date.now() - new Date(startTime).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} saattir parkta`;
  }

  // --- 9. MANUAL SPOT INTERACTIONS ---
  function manuallyParkInSpot(spotId) {
    const spot = state.spots.find(s => s.id === spotId);
    if (!spot || spot.status !== 'available') return;

    const fakeDetails = getRandomDriver();
    const rate = state.revenueRates[spot.type];

    spot.status = spot.type === 'ev' ? 'charging' : 'occupied';
    spot.occupant = {
      name: fakeDetails.name,
      plate: fakeDetails.plate,
      parkedAt: new Date(),
      targetDuration: Math.floor(Math.random() * 4) + 1,
      rate: rate,
      accumulatedRevenue: rate // initial rate accrued
    };
    state.totalRevenue += rate;

    showToast(`Araç Park Edildi: ${fakeDetails.plate} plakalı araç ${spotId} alanına yanaştı.`, 'success');
    addLog(`${fakeDetails.plate} plakalı araç ${spotId} nolu spotta park edildi. (Kat P${spot.floor})`, 'info');
    
    renderLotView();
    updateBookingSpotOptions();
  }

  function manuallyReserveSpot(spotId) {
    const spot = state.spots.find(s => s.id === spotId);
    if (!spot || spot.status !== 'available') return;

    const fakeDetails = getRandomDriver();
    
    spot.status = 'reserved';
    spot.occupant = {
      name: fakeDetails.name,
      plate: fakeDetails.plate,
      parkedAt: new Date(),
      targetDuration: 2,
      rate: state.revenueRates[spot.type],
      accumulatedRevenue: 10.0 // small reservation placeholder fee
    };
    state.totalRevenue += 10.0;

    showToast(`${spotId} nolu spot ${fakeDetails.name} adına rezerve edildi.`, 'info');
    addLog(`${spotId} nolu spot rezerve edildi. Plaka: ${fakeDetails.plate}`, 'warning');
    
    renderLotView();
    updateBookingSpotOptions();
  }

  function manuallyVacateSpot(spotId) {
    const spot = state.spots.find(s => s.id === spotId);
    if (!spot || spot.status === 'available') return;

    const driverName = spot.occupant ? spot.occupant.name : 'Araç';
    const plateVal = spot.occupant ? spot.occupant.plate : 'Bilinmeyen';
    const accrued = spot.occupant ? spot.occupant.accumulatedRevenue : 0.0;

    spot.status = 'available';
    spot.occupant = null;

    showToast(`${spotId} nolu park yeri boşaltıldı. Toplam Tahsilat: ₺${accrued.toFixed(2)}`, 'success');
    addLog(`${plateVal} plakalı araç çıkış yaptı. ${spotId} spotu boşaldı. Kazanç: ₺${accrued.toFixed(2)}`, 'success');

    // Add revenue details to current floor table representation
    const floorRevEl = document.getElementById(`tbl-rev-p${spot.floor}`);
    if (floorRevEl) {
      const currentVal = parseFloat(floorRevEl.textContent.replace('₺', ''));
      floorRevEl.textContent = `₺${(currentVal + accrued).toFixed(2)}`;
    }

    renderLotView();
    updateBookingSpotOptions();
  }

  // --- 10. SMART BOOKING & RESERVATION ENGINE ---
  function updateBookingSpotOptions() {
    const spotSelect = document.getElementById('book-spot-select');
    if (!spotSelect) return;

    spotSelect.innerHTML = '<option value="">Lütfen seçim yapın veya En Uygun Yeri seçin</option>';

    const reqType = document.getElementById('book-vehicle-type').value;
    const reqFloor = document.getElementById('book-floor').value;

    const availableSpots = state.spots.filter(spot => {
      const isAvailable = spot.status === 'available';
      const typeMatches = spot.type === reqType;
      const floorMatches = reqFloor === 'any' || spot.floor === parseInt(reqFloor);
      return isAvailable && typeMatches && floorMatches;
    });

    if (availableSpots.length === 0) {
      spotSelect.innerHTML = '<option value="">Uygun boş alan bulunamadı!</option>';
      return;
    }

    availableSpots.forEach(spot => {
      const floorNames = { 1: 'Zemin Kat (P1)', 2: '1. Kat (P2)', 3: '2. Kat (P3)' };
      const option = document.createElement('option');
      option.value = spot.id;
      option.textContent = `${spot.id} - ${floorNames[spot.floor]} (Ücret: ₺${state.revenueRates[spot.type]}/saat)`;
      spotSelect.appendChild(option);
    });
  }

  function suggestOptimalSpot() {
    const reqType = document.getElementById('book-vehicle-type').value;
    const reqFloor = document.getElementById('book-floor').value;

    // Filter available spots of the correct type
    let candidates = state.spots.filter(s => s.status === 'available' && s.type === reqType);

    // Filter by floor preference if specified
    if (reqFloor !== 'any') {
      const floorNum = parseInt(reqFloor);
      candidates = candidates.filter(s => s.floor === floorNum);
    }

    // Recommendation strategy:
    // Sort spots by proximity to the entrance/elevators.
    // In our model: 
    // - Accessible and EV spots are already closer.
    // - Lower spot numbers on lower floors are physically closest to entry.
    candidates.sort((a, b) => {
      // 1. Prioritize floor level (floor 1 first)
      if (a.floor !== b.floor) return a.floor - b.floor;
      
      // 2. Sort numerically by spot number suffix
      const numA = parseInt(a.id.slice(1));
      const numB = parseInt(b.id.slice(1));
      return numA - numB;
    });

    const msgBox = document.getElementById('recommended-spot-msg-box');
    const msgText = document.getElementById('recommended-spot-msg');
    const spotSelect = document.getElementById('book-spot-select');

    if (candidates.length > 0) {
      const bestSpot = candidates[0];
      const floorNames = { 1: 'Zemin Kat (P1)', 2: '1. Kat (P2)', 3: '2. Kat (P3)' };
      
      msgBox.style.display = 'block';
      msgText.innerHTML = `Önerilen Optimal Yer: <strong>${bestSpot.id}</strong> - ${floorNames[bestSpot.floor]} (Girişe ve Asansörlere En Yakın Konum)`;
      
      // Automatically select in dropdown
      spotSelect.value = bestSpot.id;
    } else {
      msgBox.style.display = 'block';
      msgText.innerHTML = `⚠️ Üzgünüz, kriterlerinize uygun boş park yeri bulunamadı!`;
      spotSelect.value = '';
    }
  }

  function handleReservationSubmit() {
    const driverName = document.getElementById('book-driver-name').value;
    const plate = document.getElementById('book-plate').value.toUpperCase();
    const type = document.getElementById('book-vehicle-type').value;
    const duration = parseInt(document.getElementById('book-duration').value);
    const spotId = document.getElementById('book-spot-select').value;

    if (!spotId) {
      showToast('Lütfen geçerli bir park yeri seçin.', 'error');
      return;
    }

    const spot = state.spots.find(s => s.id === spotId);
    if (!spot || spot.status !== 'available') {
      showToast('Seçilen spot artık müsait değil.', 'error');
      return;
    }

    const rate = state.revenueRates[type];
    const totalCost = rate * duration;

    // Occupy/Reserve spot
    spot.status = 'reserved';
    spot.occupant = {
      name: driverName,
      plate: plate,
      parkedAt: new Date(),
      targetDuration: duration,
      rate: rate,
      accumulatedRevenue: totalCost
    };
    state.totalRevenue += totalCost;

    // Generate ticket details
    document.getElementById('ticket-val-plate').textContent = plate;
    document.getElementById('ticket-val-driver').textContent = driverName;
    
    const floorNames = { 1: 'Zemin Kat (P1)', 2: '1. Kat (P2)', 3: '2. Kat (P3)' };
    document.getElementById('ticket-val-spot').textContent = `${spotId} (${floorNames[spot.floor]})`;
    document.getElementById('ticket-val-cost').textContent = `${duration} Saat / ₺${totalCost.toFixed(2)}`;
    
    const randomCode = `SPK-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10 + Math.random() * 90)}`;
    document.getElementById('ticket-val-code').textContent = randomCode;

    // Hide placeholder, display ticket card
    document.getElementById('no-ticket-placeholder').style.display = 'none';
    const ticketCard = document.getElementById('ticket-card-view');
    ticketCard.style.display = 'block';

    // Draw Mock QR Code on Canvas
    drawQrCode(plate + ' ' + spotId + ' ' + randomCode);

    // Alert driver and log
    showToast(`Rezervasyon onaylandı! Spot: ${spotId}`, 'success');
    addLog(`Rezervasyon oluşturuldu. ${driverName} (${plate}) -> Spot: ${spotId}`, 'success');

    // Reset Form
    document.getElementById('booking-form').reset();
    document.getElementById('recommended-spot-msg-box').style.display = 'none';
    updateBookingSpotOptions();
  }

  // Draw Pixelated QR Code Mockup
  function drawQrCode(text) {
    const canvas = document.getElementById('qr-code-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = 114;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#0f172a'; // Deep slate block color
    
    const blockSize = 6;
    const blocksCount = size / blockSize; // 19 blocks

    // Helper to draw a square block
    function drawBlock(x, y) {
      ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    }

    // Helper to draw a nested Finder Pattern
    function drawFinderPattern(x, y) {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const isBorder = i === 0 || i === 6 || j === 0 || j === 6;
          const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          if (isBorder || isCenter) {
            drawBlock(x + i, y + j);
          }
        }
      }
    }

    // Top-Left Finder
    drawFinderPattern(0, 0);
    // Top-Right Finder
    drawFinderPattern(blocksCount - 7, 0);
    // Bottom-Left Finder
    drawFinderPattern(0, blocksCount - 7);

    // Draw random pixel noise elsewhere to simulate QR data
    for (let x = 0; x < blocksCount; x++) {
      for (let y = 0; y < blocksCount; y++) {
        // Skip finder areas
        const inTopLeft = x < 8 && y < 8;
        const inTopRight = x > blocksCount - 9 && y < 8;
        const inBottomLeft = x < 8 && y > blocksCount - 9;
        
        if (!inTopLeft && !inTopRight && !inBottomLeft) {
          // Semi-random deterministic fill based on characters to look real
          const seed = (x * y + text.charCodeAt(x % text.length)) % 10;
          if (seed < 4) {
            drawBlock(x, y);
          }
        }
      }
    }
  }

  // --- 11. AUTOMATIC SIMULATION ENGINE ---
  function startSimulation() {
    if (!state.simulationActive) return;

    let intervalMs = 2500;
    if (state.simulationSpeed === 'slow') intervalMs = 5000;
    if (state.simulationSpeed === 'fast') intervalMs = 1000;

    state.simulationTimer = setInterval(() => {
      // 1. Advance duration & accrue revenues of currently parked cars
      state.spots.forEach(spot => {
        if (spot.status === 'occupied' || spot.status === 'charging') {
          // Accrue billing
          spot.occupant.accumulatedRevenue += spot.occupant.rate / 60; // fraction of hourly rate
          state.totalRevenue += spot.occupant.rate / 60;
          
          // Random check to leave
          const timeElapsedHours = (Date.now() - new Date(spot.occupant.parkedAt).getTime()) / (1000 * 60 * 60);
          if (timeElapsedHours > spot.occupant.targetDuration || Math.random() < 0.05) {
            // Vacate
            addLog(`${spot.occupant.plate} plakalı araç park yerinden çıkış yaptı (${spot.id}). Kazanç: ₺${spot.occupant.accumulatedRevenue.toFixed(2)}`, 'success');
            
            // Add to floor table revenue
            const tblRev = document.getElementById(`tbl-rev-p${spot.floor}`);
            if (tblRev) {
              const prev = parseFloat(tblRev.textContent.replace('₺', ''));
              tblRev.textContent = `₺${(prev + spot.occupant.accumulatedRevenue).toFixed(2)}`;
            }

            spot.status = 'available';
            spot.occupant = null;
          }
        } else if (spot.status === 'reserved') {
          // Reserved spots have a chance to convert into parked/occupied
          if (Math.random() < 0.35) {
            spot.status = spot.type === 'ev' ? 'charging' : 'occupied';
            spot.occupant.parkedAt = new Date(); // Reset park timer to now
            addLog(`Rezervasyonlu araç giriş yaptı: ${spot.occupant.plate} (${spot.id})`, 'info');
          } else if (Math.random() < 0.1) {
            // Cancel reservation
            addLog(`Rezervasyon iptal edildi: ${spot.occupant.plate} (${spot.id})`, 'warning');
            spot.status = 'available';
            spot.occupant = null;
          }
        }
      });

      // 2. Generate random arrivals based on bias slider
      const arrivalChance = state.arrivalBias / 100;
      if (Math.random() < arrivalChance) {
        simulateRandomArrival();
      }

      // 3. Reactively update dashboard / lot map variables
      if (state.currentView === 'dashboard') {
        renderDashboard();
      } else if (state.currentView === 'lot-view') {
        renderLotView();
      }
      
      // Update floor average occupancy percentages in analytics tables
      updateTableStats();

    }, intervalMs);
  }

  function simulateRandomArrival() {
    // Determine vehicle type
    const roll = Math.random() * 100;
    let type = 'standard';
    if (roll < 10) type = 'accessible';
    else if (roll < 25) type = 'ev';
    else if (roll < 32) type = 'motorcycle';

    // Find available spots of this type
    const availableSpots = state.spots.filter(s => s.status === 'available' && s.type === type);
    
    if (availableSpots.length === 0) {
      addLog(`Giriş Sırası: ${type.toUpperCase()} tipi araç için boş yer kalmadı!`, 'danger');
      return;
    }

    // Pick a spot (prefer smaller suffix number - closer)
    availableSpots.sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return parseInt(a.id.slice(1)) - parseInt(b.id.slice(1));
    });

    const chosenSpot = availableSpots[0];
    const mockDriver = getRandomDriver();
    const rate = state.revenueRates[type];

    chosenSpot.status = type === 'ev' ? 'charging' : 'occupied';
    chosenSpot.occupant = {
      name: mockDriver.name,
      plate: mockDriver.plate,
      parkedAt: new Date(),
      targetDuration: Math.floor(Math.random() * 4) + 1,
      rate: rate,
      accumulatedRevenue: rate
    };
    state.totalRevenue += rate;

    addLog(`${mockDriver.plate} plakalı ${type.toUpperCase()} tipi araç otoparka giriş yaptı: ${chosenSpot.id}`, 'info');
  }

  function simulateManualVehicleArrival() {
    simulateRandomArrival();
    if (state.currentView === 'dashboard') renderDashboard();
    else if (state.currentView === 'lot-view') renderLotView();
    showToast('Rastgele araç girişi tetiklendi.', 'info');
  }

  function simulateManualVehicleDeparture() {
    const occupied = state.spots.filter(s => s.status === 'occupied' || s.status === 'charging');
    if (occupied.length === 0) {
      showToast('Otoparkta boşaltılacak araç yok!', 'warning');
      return;
    }

    const randomSpot = occupied[Math.floor(Math.random() * occupied.length)];
    manuallyVacateSpot(randomSpot.id);
  }

  function resetSystemData() {
    clearInterval(state.simulationTimer);
    state.spots = [];
    state.totalRevenue = 0.0;
    state.logs = [];

    // Reset Table CIROS
    document.getElementById('tbl-rev-p1').textContent = '₺0.00';
    document.getElementById('tbl-rev-p2').textContent = '₺0.00';
    document.getElementById('tbl-rev-p3').textContent = '₺0.00';

    // Hide tickets
    document.getElementById('ticket-card-view').style.display = 'none';
    document.getElementById('no-ticket-placeholder').style.display = 'block';

    initSpots();
    if (state.simulationActive) startSimulation();

    // Re-renders
    if (state.currentView === 'dashboard') renderDashboard();
    else if (state.currentView === 'lot-view') renderLotView();
    else if (state.currentView === 'reservations') updateBookingSpotOptions();

    showToast('Tüm otopark verileri sıfırlandı.', 'warning');
  }

  function updateTableStats() {
    for (let f = 1; f <= 3; f++) {
      const fSpots = state.spots.filter(s => s.floor === f);
      const occupied = fSpots.filter(s => s.status !== 'available').length;
      const pct = Math.round((occupied / fSpots.length) * 100);
      
      const el = document.getElementById(`tbl-occ-p${f}`);
      if (el) el.textContent = `${pct}%`;
    }
  }

  // --- 12. ANALYTICS CHARTS (SVG RENDERING) ---
  function renderAnalyticsCharts() {
    renderOccupancyChart();
    renderRevenueChart();
    updateTableStats();
  }

  function renderOccupancyChart() {
    const svg = document.getElementById('analytics-occupancy-chart');
    if (!svg) return;

    // Clear previous children
    svg.innerHTML = `
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0"/>
        </linearGradient>
      </defs>
    `;

    const width = 500;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 40 };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const data = state.occupancyTrendHistory;
    const xStep = chartWidth / (data.length - 1);

    // Draw Grid lines
    for (let i = 0; i <= 5; i++) {
      const yVal = padding.top + (chartHeight / 5) * i;
      const percent = Math.round(100 - (100 / 5) * i);
      
      // Grid line
      svg.insertAdjacentHTML('beforeend', `
        <line class="svg-grid-line" x1="${padding.left}" y1="${yVal}" x2="${width - padding.right}" y2="${yVal}" />
        <text class="svg-axis-label" x="${padding.left - 10}" y="${yVal + 4}" text-anchor="end">${percent}%</text>
      `);
    }

    // Build line points path
    let points = [];
    data.forEach((val, index) => {
      const x = padding.left + index * xStep;
      const y = padding.top + chartHeight - (val / 100) * chartHeight;
      points.push({x, y, val, index});
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

    // Draw Area under curve
    svg.insertAdjacentHTML('beforeend', `<path class="svg-area-primary" d="${areaPath}" />`);
    // Draw Line
    svg.insertAdjacentHTML('beforeend', `<path class="svg-line-primary" d="${linePath}" />`);

    // Draw data circles and hover tooltips
    points.forEach((p, idx) => {
      // Limit to draw every 3rd label on axis to avoid cluttering
      if (idx % 4 === 0) {
        svg.insertAdjacentHTML('beforeend', `
          <text class="svg-axis-label" x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle">${idx.toString().padStart(2, '0')}:00</text>
        `);
      }

      // Draw glowing dot markers
      const dotHtml = `
        <circle class="svg-dot-marker" cx="${p.x}" cy="${p.y}" r="4" data-index="${idx}" />
      `;
      svg.insertAdjacentHTML('beforeend', dotHtml);
    });

    // Setup interactive tooltips
    const tooltip = document.getElementById('occupancy-tooltip');
    const dots = svg.querySelectorAll('.svg-dot-marker');
    
    dots.forEach(dot => {
      dot.addEventListener('mouseenter', (e) => {
        const idx = e.target.getAttribute('data-index');
        const val = data[idx];
        const rect = svg.getBoundingClientRect();
        
        tooltip.style.opacity = 1;
        tooltip.innerHTML = `Saat: <strong>${idx.toString().padStart(2, '0')}:00</strong><br>Doluluk: <strong>%${val}</strong>`;
        tooltip.style.left = `${(e.clientX - rect.left) + 15}px`;
        tooltip.style.top = `${(e.clientY - rect.top) - 30}px`;
      });

      dot.addEventListener('mouseleave', () => {
        tooltip.style.opacity = 0;
      });
    });
  }

  function renderRevenueChart() {
    const svg = document.getElementById('analytics-revenue-chart');
    if (!svg) return;

    svg.innerHTML = '';

    const width = 500;
    const height = 280;
    const padding = { top: 20, right: 20, bottom: 40, left: 45 };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const data = state.hourlyRevenueHistory;
    const maxVal = Math.max(...data, 100);
    const barWidth = (chartWidth / data.length) - 8;

    // Draw horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const yVal = padding.top + (chartHeight / 4) * i;
      const amt = Math.round(maxVal - (maxVal / 4) * i);
      
      svg.insertAdjacentHTML('beforeend', `
        <line class="svg-grid-line" x1="${padding.left}" y1="${yVal}" x2="${width - padding.right}" y2="${yVal}" />
        <text class="svg-axis-label" x="${padding.left - 10}" y="${yVal + 4}" text-anchor="end">₺${amt}</text>
      `);
    }

    // Draw Bars
    data.forEach((val, idx) => {
      const x = padding.left + idx * (chartWidth / data.length) + 4;
      const barHeight = (val / maxVal) * chartHeight;
      const y = padding.top + chartHeight - barHeight;

      // Draw rounded column bar
      const barHtml = `
        <rect class="analytics-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#cyanPurpleGrad)" opacity="0.85" data-index="${idx}" style="cursor:pointer; transition: opacity 0.2s;" />
      `;
      svg.insertAdjacentHTML('beforeend', barHtml);

      // Label on X axis
      const hrs = 8 + idx; // simulate from 8:00 AM onwards
      svg.insertAdjacentHTML('beforeend', `
        <text class="svg-axis-label" x="${x + barWidth/2}" y="${height - padding.bottom + 20}" text-anchor="middle">${hrs}:00</text>
      `);
    });

    // Tooltip trigger
    const tooltip = document.getElementById('revenue-tooltip');
    const bars = svg.querySelectorAll('.analytics-bar');
    
    bars.forEach(bar => {
      bar.addEventListener('mouseenter', (e) => {
        bar.setAttribute('opacity', '1');
        const idx = e.target.getAttribute('data-index');
        const val = data[idx];
        const hrs = 8 + parseInt(idx);
        const rect = svg.getBoundingClientRect();
        
        tooltip.style.opacity = 1;
        tooltip.innerHTML = `Saat Aralığı: <strong>${hrs}:00 - ${hrs+1}:00</strong><br>Toplam Gelir: <strong>₺${val.toFixed(2)}</strong>`;
        tooltip.style.left = `${(e.clientX - rect.left) + 15}px`;
        tooltip.style.top = `${(e.clientY - rect.top) - 30}px`;
      });

      bar.addEventListener('mouseleave', (e) => {
        bar.setAttribute('opacity', '0.85');
        tooltip.style.opacity = 0;
      });
    });
  }

  // --- 13. UTILITIES & MOCK GENERATORS ---
  function getRandomDriver() {
    const firstNames = ['Ahmet', 'Mehmet', 'Mustafa', 'Ayşe', 'Fatma', 'Emine', 'Ali', 'Hüseyin', 'Zeynep', 'Yusuf', 'Ömer', 'Elif', 'Can', 'Deniz', 'Murat', 'Burak', 'Hakan', 'Selin'];
    const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Koç', 'Kurt'];
    const cities = ['34', '06', '35', '16', '07', '54', '41', '61'];
    
    const randomName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randLetters = letters[Math.floor(Math.random() * letters.length)] + 
                        letters[Math.floor(Math.random() * letters.length)] + 
                        (Math.random() < 0.5 ? letters[Math.floor(Math.random() * letters.length)] : '');
                        
    const digits = Math.floor(100 + Math.random() * 9000);
    const randomPlate = `${cities[Math.floor(Math.random() * cities.length)]} ${randLetters} ${digits}`;

    return { name: randomName, plate: randomPlate };
  }

  function calculateStats() {
    const capacity = state.spots.length;
    const occupiedList = state.spots.filter(s => s.status === 'occupied' || s.status === 'charging');
    const reservedList = state.spots.filter(s => s.status === 'reserved');
    
    const occupied = occupiedList.length;
    const reserved = reservedList.length;
    const available = capacity - occupied - reserved;
    const occupancyPercent = Math.round((occupied / capacity) * 100) || 0;

    // Type capacities & occupancy counters
    const evSpots = state.spots.filter(s => s.type === 'ev');
    const hcSpots = state.spots.filter(s => s.type === 'accessible');
    const mcSpots = state.spots.filter(s => s.type === 'motorcycle');

    return {
      capacity,
      occupied,
      reserved,
      available,
      occupancyPercent,
      capacityEv: evSpots.length,
      occupiedEv: evSpots.filter(s => s.status !== 'available').length,
      capacityHc: hcSpots.length,
      occupiedHc: hcSpots.filter(s => s.status !== 'available').length,
      capacityMc: mcSpots.length,
      occupiedMc: mcSpots.filter(s => s.status !== 'available').length
    };
  }

  // Toast notifications component
  function showToast(message, type = 'info') {
    const wrapper = document.getElementById('toast-wrapper');
    if (!wrapper) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const icons = { success: '✓', info: 'i', warning: '!', error: '✗' };
    
    toast.innerHTML = `
      <div class="toast-icon ${type}">${icons[type] || 'i'}</div>
      <span>${message}</span>
    `;

    wrapper.appendChild(toast);

    // Auto remove toast after 4s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => {
        wrapper.removeChild(toast);
      }, 300);
    }, 4000);
  }
});
