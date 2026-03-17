    // Constants
    const PRODUCT_COST = 555;
    const SHIPPING_COST = 135;
    const STATUS_TAGS = ['Delivered','Canceled','Attempted Delivery','In Transit','Paid','Payment Pending','Unfulfilled','Fulfilled'];
    const CHART_COLORS = {
      'Delivered': '#4caf50',
      'Canceled': '#f44336',
      'Attempted Delivery': '#e07a10',
      'In Transit': '#2196f3',
      'Paid': '#4caf50',
      'Payment Pending': '#e07a10',
      'Unfulfilled': '#f44336',
      'Fulfilled': '#4caf50',
      'Other': '#757575'
    };

    // State
    let state = {
      view: 'daily',
      storeUrl: localStorage.getItem('shopify_store_url') || '',
      apiToken: localStorage.getItem('shopify_api_token') || '',
      supabaseUrl: localStorage.getItem('supabase_url') || '',
      supabaseKey: localStorage.getItem('supabase_key') || '',
      isDemoMode: true,
      orders: [], // Current view orders
      adCosts: {}, // Loaded from Supabase for current view
      charts: { daily: null, weekly: null, monthly: null }
    };

    let sbClient = null;
    if(state.supabaseUrl && state.supabaseKey) {
      sbClient = window.supabase.createClient(state.supabaseUrl, state.supabaseKey);
    }

    // Date Utilities
    function toDateStr(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
    function getWeekStart(d) {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(new Date(d).setDate(diff));
      start.setHours(0,0,0,0);
      return start;
    }
    function fmt(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
    function fmtK(n) { return n >= 1000 ? '₹' + (n / 1000).toFixed(1) + 'K' : '₹' + Math.round(n); }
    function getTagClass(t) {
      return 'tag-' + t.toLowerCase().replace(/\s+/g, '-');
    }

    // Storage (Supabase)
    async function saveAdCost(dateStr, cost) {
      if(state.isDemoMode || !sbClient) {
        state.adCosts[dateStr] = parseFloat(cost) || 0;
        return;
      }
      const val = parseFloat(cost) || 0;
      state.adCosts[dateStr] = val;
      const { error } = await sbClient.from('ad_spend').upsert({ date: dateStr, amount: val });
      if(error) console.error("Error saving ad spend:", error);
    }

    async function loadAdCosts(minDate, maxDate) {
      if(state.isDemoMode || !sbClient) return;
      const { data, error } = await sbClient
        .from('ad_spend')
        .select('date, amount')
        .gte('date', minDate)
        .lte('date', maxDate);
      
      if(!error && data) {
        state.adCosts = {}; // reset
        data.forEach(row => state.adCosts[row.date] = row.amount);
      }
    }

    // Modal Logic
    document.getElementById('btn-setup').addEventListener('click', () => {
      document.getElementById('input-store').value = state.storeUrl;
      document.getElementById('input-token').value = state.apiToken;
      document.getElementById('input-supabase-url').value = state.supabaseUrl;
      document.getElementById('input-supabase-key').value = state.supabaseKey;
      document.getElementById('setup-modal').classList.add('active');
    });
    
    document.getElementById('btn-cancel-setup').addEventListener('click', () => {
      document.getElementById('setup-modal').classList.remove('active');
    });
    
    document.getElementById('btn-save-setup').addEventListener('click', () => {
      const url = document.getElementById('input-store').value.trim();
      const token = document.getElementById('input-token').value.trim();
      const sbUrl = document.getElementById('input-supabase-url').value.trim();
      const sbKey = document.getElementById('input-supabase-key').value.trim();
      
      let valid = true;
      if (!url) { document.getElementById('err-store').style.display = 'block'; valid = false; } else { document.getElementById('err-store').style.display = 'none'; }
      if (!token) { document.getElementById('err-token').style.display = 'block'; valid = false; } else { document.getElementById('err-token').style.display = 'none'; }
      if (!sbUrl) { document.getElementById('err-supabase-url').style.display = 'block'; valid = false; } else { document.getElementById('err-supabase-url').style.display = 'none'; }
      if (!sbKey) { document.getElementById('err-supabase-key').style.display = 'block'; valid = false; } else { document.getElementById('err-supabase-key').style.display = 'none'; }
      
      if (!valid) return;

      state.storeUrl = url;
      state.apiToken = token;
      state.supabaseUrl = sbUrl;
      state.supabaseKey = sbKey;
      
      localStorage.setItem('shopify_store_url', url);
      localStorage.setItem('shopify_api_token', token);
      localStorage.setItem('supabase_url', sbUrl);
      localStorage.setItem('supabase_key', sbKey);
      
      sbClient = window.supabase.createClient(sbUrl, sbKey);
      
      document.getElementById('setup-modal').classList.remove('active');
      setMode(false);
      fetchCurrentView();
    });

    document.getElementById('btn-demo-toggle').addEventListener('click', () => {
      setMode(true);
      fetchCurrentView();
    });

    function setMode(isDemo) {
      state.isDemoMode = isDemo;
      updateHeader();
    }

    function updateHeader() {
      const demoBadge = document.getElementById('demo-badge');
      const connBadge = document.getElementById('conn-badge');
      if (state.isDemoMode) {
        demoBadge.style.display = 'inline-block';
        connBadge.style.display = 'none';
        document.getElementById('btn-demo-toggle').style.display = 'none';
      } else {
        demoBadge.style.display = 'none';
        connBadge.style.display = 'inline-block';
        connBadge.textContent = state.storeUrl;
        document.getElementById('btn-demo-toggle').style.display = 'inline-block';
      }
    }

    // Tab Logic
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(tb => tb.classList.remove('active'));
        document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
        e.target.classList.add('active');
        state.view = e.target.dataset.target;
        document.getElementById(`view-${state.view}`).classList.add('active');
        // Initial setup for view if needed
        setupViewInputs();
        fetchCurrentView();
      });
    });

    function setupViewInputs() {
      const now = new Date();
      if (!document.getElementById('daily-start-date').value) {
        let d = new Date(now);
        d.setDate(d.getDate() - 6);
        document.getElementById('daily-start-date').value = toDateStr(d);
      }
      if (!document.getElementById('daily-end-date').value) {
        document.getElementById('daily-end-date').value = toDateStr(now);
      }
      if (!document.getElementById('weekly-date').value) {
        document.getElementById('weekly-date').value = toDateStr(now);
      }

      // Populate months and years exactly once
      const mSel = document.getElementById('monthly-month');
      if(mSel.options.length === 0) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        months.forEach((m, i) => mSel.add(new Option(m, i)));
        mSel.value = now.getMonth();
        
        const ySel = document.getElementById('monthly-year');
        const cy = now.getFullYear();
        for(let i=0; i<3; i++) ySel.add(new Option(cy-i, cy-i));
      }
    }

    document.getElementById('btn-fetch-daily').addEventListener('click', fetchCurrentView);
    document.getElementById('btn-fetch-weekly').addEventListener('click', fetchCurrentView);
    document.getElementById('btn-fetch-monthly').addEventListener('click', fetchCurrentView);

    function showLoading(msg) {
      document.getElementById('loading').classList.add('active');
      document.getElementById('loading-msg').textContent = msg || '';
    }
    function hideLoading() {
      document.getElementById('loading').classList.remove('active');
    }

    // Data Processing Utils
    function categorizeOrders(orders) {
      const counts = {};
      STATUS_TAGS.forEach(t => counts[t] = 0);
      counts['Other'] = 0;

      orders.forEach(o => {
        const tags = (o.tags || '').split(',').map(t => t.trim().toLowerCase());
        let matched = false;
        STATUS_TAGS.forEach(st => {
          if (tags.includes(st.toLowerCase())) { counts[st]++; matched = true; }
        });
        if (!matched) counts['Other']++;
      });
      return counts;
    }

    function getTotalRevenue(orders) {
      return orders
        .filter(o => (o.tags || '').toLowerCase().split(',').map(t => t.trim()).includes('delivered'))
        .reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    }

    function calcPL(revenue, deliveredCount, adCost) {
      const productCost = deliveredCount * PRODUCT_COST;
      const shippingCost = deliveredCount * SHIPPING_COST;
      const totalCost = productCost + shippingCost + adCost;
      const profit = revenue - totalCost;
      return { revenue, productCost, shippingCost, adCost, totalCost, profit };
    }

    // Demo Data Generator
    function generateDemoOrders(dateStr) {
      const orders = [];
      const numOrders = Math.floor(Math.random() * 9) + 10; // 10-18
      const firstNames = ['Aarav','Raj','Neha','Priya','Vikram','Sanjay','Kavita','Anjali','Rahul'];
      const lastNames = ['Sharma','Patel','Singh','Kumar','Verma','Gupta','Rao'];
      const amounts = [999, 1999, 2999, 3999];
      const distribution = [
        {t: 'Delivered', p: 0.4}, {t: 'In Transit', p: 0.2}, {t: 'Paid', p: 0.15},
        {t: 'Unfulfilled', p: 0.1}, {t: 'Canceled', p: 0.08}, {t: 'Attempted Delivery', p: 0.07}
      ];

      for(let i=0; i<numOrders; i++) {
        let rand = Math.random();
        let cumulative = 0;
        let tag = 'Other';
        for(let j=0; j<distribution.length; j++) {
          cumulative += distribution[j].p;
          if(rand <= cumulative) { tag = distribution[j].t; break; }
        }

        const hr = String(Math.floor(Math.random() * 24)).padStart(2,'0');
        const min = String(Math.floor(Math.random() * 60)).padStart(2,'0');
        
        orders.push({
          id: Math.floor(Math.random() * 1000000000),
          name: '#1' + String(Math.floor(Math.random() * 9000) + 1000),
          created_at: `${dateStr}T${hr}:${min}:00+05:30`,
          total_price: amounts[Math.floor(Math.random() * amounts.length)],
          tags: tag,
          customer: {
            first_name: firstNames[Math.floor(Math.random() * firstNames.length)],
            last_name: lastNames[Math.floor(Math.random() * lastNames.length)]
          }
        });
      }
      return orders;
    }

    // Fetch API
    async function syncShopifyToSupabase(minDate, maxDate) {
      if(!sbClient || state.isDemoMode) return;

      // 1. Find the latest order we have for this date range in Supabase
      const { data: latestOrder, error: sbErr } = await sbClient
        .from('orders')
        .select('created_at')
        .gte('created_at', minDate)
        .lte('created_at', maxDate)
        .order('created_at', { ascending: false })
        .limit(1);

      let fetchFrom = minDate;
      if (!sbErr && latestOrder && latestOrder.length > 0) {
        // We have some data. Only fetch newer orders from Shopify.
        // Add 1 second to avoid duplicating the exact same order.
        let dt = new Date(latestOrder[0].created_at);
        dt.setSeconds(dt.getSeconds() + 1); 
        fetchFrom = dt.toISOString();
      }

      // 2. Fetch missing orders from Shopify
      const url = `https://${state.storeUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${fetchFrom}&created_at_max=${maxDate}&limit=250`;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': state.apiToken,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // 3. Save new orders into Supabase
        if(data.orders && data.orders.length > 0) {
          const toInsert = data.orders.map(o => ({
            id: o.id,
            name: o.name,
            created_at: o.created_at,
            total_price: o.total_price,
            tags: o.tags,
            customer_fn: o.customer ? o.customer.first_name : null,
            customer_ln: o.customer ? o.customer.last_name : null
          }));

          const { error: insertErr } = await sbClient.from('orders').upsert(toInsert, { onConflict: 'id' });
          if(insertErr) console.error("Supabase insert error:", insertErr);
        }
      } catch (e) {
        console.error("Shopify Sync Error:", e);
        throw e;
      }
    }

    async function fetchOrdersFromSupabase(minDate, maxDate) {
      const { data, error } = await sbClient
        .from('orders')
        .select('*')
        .gte('created_at', minDate)
        .lte('created_at', maxDate)
        .order('created_at', { ascending: false });
        
      if(error) throw error;

      // Re-map column names to match what the UI expects (mimicking standard Shopify JSON struct)
      return data.map(o => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        total_price: o.total_price,
        tags: o.tags,
        customer: { first_name: o.customer_fn, last_name: o.customer_ln }
      }));
    }

    // Fetch Orchestrator
    async function fetchCurrentView() {
      if (!state.isDemoMode && (!state.storeUrl || !state.apiToken || !state.supabaseUrl)) {
        alert("Please set up your API credentials first (Shopify & Supabase).");
        document.getElementById('setup-modal').classList.add('active');
        return;
      }

      showLoading('Syncing and loading orders...');

      try {
        let minDate, maxDate, dbMin, dbMax;
        
        if (state.view === 'daily') {
          const startDateStr = document.getElementById('daily-start-date').value;
          const endDateStr = document.getElementById('daily-end-date').value;
          dbMin = startDateStr; dbMax = endDateStr;
          minDate = `${startDateStr}T00:00:00`; maxDate = `${endDateStr}T23:59:59`;
        } else if (state.view === 'weekly') {
          const wDate = new Date(document.getElementById('weekly-date').value);
          const wStart = getWeekStart(wDate);
          const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
          dbMin = toDateStr(wStart); dbMax = toDateStr(wEnd);
          minDate = `${dbMin}T00:00:00`; maxDate = `${dbMax}T23:59:59`;
        } else if (state.view === 'monthly') {
          const y = parseInt(document.getElementById('monthly-year').value);
          const m = parseInt(document.getElementById('monthly-month').value);
          const mStart = new Date(y, m, 1);
          const mEnd = new Date(y, m + 1, 0);
          dbMin = toDateStr(mStart); dbMax = toDateStr(mEnd);
          minDate = `${dbMin}T00:00:00`; maxDate = `${dbMax}T23:59:59`;
        }

        if(state.isDemoMode) {
          // Generate pseudo-demo data
          let start = new Date(`${dbMin}T00:00:00`);
          let end = new Date(`${dbMax}T00:00:00`);
          let allOrders = [];
          for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            allOrders = allOrders.concat(generateDemoOrders(toDateStr(d)));
          }
          state.orders = allOrders;
        } else {
          // 1. Sync missing data from Shopify into Supabase
          try {
            await syncShopifyToSupabase(minDate, maxDate);
          } catch(e) {
            // If Shopify fails (CORS etc), we will still try to load whatever is currently in Supabase.
            console.warn("Shopify sync failed. Falling back to cached database data if available.");
          }
          // 2. Fetch everything locally from Supabase
          state.orders = await fetchOrdersFromSupabase(minDate, maxDate);
          // 3. Load Ad Spend from Supabase
          await loadAdCosts(dbMin, dbMax);
        }

        // Render matching UI
        if (state.view === 'daily') renderDaily(new Date(dbMin), new Date(dbMax));
        else if (state.view === 'weekly') renderWeekly(new Date(dbMin), new Date(dbMax));
        else if (state.view === 'monthly') renderMonthly(new Date(dbMin), new Date(dbMax));

      } catch (error) {
        console.error("Error updating view:", error);
        if(!state.isDemoMode) {
          alert("Failed to fetch data from Supabase. Falling back to Demo Mode.");
          setMode(true);
          fetchCurrentView();
        }
      } finally {
        hideLoading();
      }
    }

    // RENDERING: DAILY
    function renderDaily(dStart, dEnd) {
      document.getElementById('daily-last-updated').textContent = `Loaded at ${new Date().toLocaleTimeString()}`;
      
      const feedContainer = document.getElementById('daily-feed');
      feedContainer.innerHTML = ''; // clear

      // To iterate newest to oldest
      const dayBlocks = [];

      for (var d = new Date(dEnd); d >= dStart; d.setDate(d.getDate() - 1)) {
        const dateStr = toDateStr(d);
        const dayOrders = state.orders.filter(o => o.created_at && o.created_at.startsWith(dateStr));
        const tagsCounts = categorizeOrders(dayOrders);
        const revenue = getTotalRevenue(dayOrders);
        const deliveredCount = tagsCounts['Delivered'] || 0;
        const adCost = state.adCosts[dateStr] || 0;
        const pl = calcPL(revenue, deliveredCount, adCost);

        const prettyDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const profitClass = pl.profit >= 0 ? 'text-profit' : 'text-loss';
        const profitChar = pl.profit >= 0 ? '▲' : '▼';

        // Order Rows
        const maxRows = 50;
        const orderRows = dayOrders.slice(0, maxRows).map(o => {
          const tStr = o.tags || '';
          const tRender = tStr.split(',').filter(t=>t.trim()).map(t => `<span class="order-tag">${t.trim()}</span>`).join('');
          const fn = (o.customer && o.customer.first_name) || '';
          const ln = (o.customer && o.customer.last_name) || '';
          const time = o.created_at ? new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
          return `
            <tr>
              <td>${o.name}</td>
              <td>${fn} ${ln}</td>
              <td>${fmt(o.total_price)}</td>
              <td><div class="order-tags">${tRender}</div></td>
              <td>${time}</td>
            </tr>
          `;
        }).join('');

        let countText = dayOrders.length.toString();
        if(dayOrders.length > maxRows) countText = `Showing ${maxRows} of ${dayOrders.length}`;

        // Create DOM element for the day block
        const dayEl = document.createElement('div');
        dayEl.className = 'day-block glass';
        dayEl.innerHTML = `
          <div class="day-header">
            <h2>${prettyDate}</h2>
            <div class="day-actions">
              <span class="badge ${pl.profit >= 0 ? 'live' : 'demo'}" style="font-size: 14px;">Net: ${profitChar}${fmt(Math.abs(pl.profit))}</span>
            </div>
          </div>

          <div class="metrics-grid" style="margin-bottom: 24px;">
            <div class="metric-card"><div class="metric-label">Orders</div><div class="metric-value">${dayOrders.length}</div></div>
            <div class="metric-card"><div class="metric-label">Delivered</div><div class="metric-value text-profit">${deliveredCount}</div></div>
            <div class="metric-card"><div class="metric-label">Revenue</div><div class="metric-value">${fmtK(revenue)}</div></div>
            <div class="metric-card">
              <div class="metric-label">Ad Spend</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                <input type="number" id="ad-${dateStr}" class="inline-input" value="${adCost}" style="width:70px; padding:6px; font-size:16px;"/>
                <button class="inline-btn primary" id="btn-ad-${dateStr}">Save</button>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;" onclick="document.getElementById('orders-${dateStr}').style.display = document.getElementById('orders-${dateStr}').style.display === 'none' ? 'block' : 'none'">
            <h3 style="margin:0; font-size: 16px;">View Orders (${countText})</h3>
            <span style="color:var(--text-muted)">▼</span>
          </div>

          <div id="orders-${dateStr}" style="display: none; margin-top: 16px;">
            <div class="orders-table-wrapper" style="margin: 0; padding: 0;">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Tags</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderRows || '<tr><td colspan="5" style="text-align:center; color:var(--text-muted)">No orders this day</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `;

        dayBlocks.push(dayEl);
      }

      for (let el of dayBlocks) {
        feedContainer.appendChild(el);
      }

      // Attach event listeners for Ad Cost
      dayBlocks.forEach(el => {
        const btn = el.querySelector('button[id^="btn-ad-"]');
        if (btn) {
          btn.addEventListener('click', (e) => {
            const dateStr = e.target.id.replace('btn-ad-', '');
            const val = document.getElementById(`ad-${dateStr}`).value;
            saveAdCost(dateStr, val).then(() => {
               // Soft re-render to update UI immediately
               const dStartStr = document.getElementById('daily-start-date').value;
               const dEndStr = document.getElementById('daily-end-date').value;
               renderDaily(new Date(dStartStr), new Date(dEndStr));
            });
          });
        }
      });
      
      if(dayBlocks.length === 0) {
        feedContainer.innerHTML = '<div class="empty-state">No days selected or invalid date range.</div>';
      }
    }

    // RENDERING: WEEKLY
    function renderWeekly(wStart, wEnd) {
      document.getElementById('weekly-range').textContent = `${toDateStr(wStart)} to ${toDateStr(wEnd)}`;
      
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalDelivered = 0;
      let totalAdCost = 0;
      
      let daysData = [];

      for (var d = new Date(wStart); d <= wEnd; d.setDate(d.getDate() + 1)) {
        const dStr = toDateStr(d);
        const dOrders = state.orders.filter(o => o.created_at && o.created_at.startsWith(dStr));
        const tCounts = categorizeOrders(dOrders);
        const dRev = getTotalRevenue(dOrders);
        const dDel = tCounts['Delivered'] || 0;
        const dCanc = tCounts['Canceled'] || 0;
        const dAd = state.adCosts[dStr] || 0;
        const dPL = calcPL(dRev, dDel, dAd);

        totalOrders += dOrders.length;
        totalRevenue += dRev;
        totalDelivered += dDel;
        totalAdCost += dAd;

        daysData.push({
          label: d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}),
          dayLabel: d.toLocaleDateString('en-US', {weekday:'short'}),
          orders: dOrders.length,
          delivered: dDel,
          canceled: dCanc,
          profit: dPL.profit
        });
      }

      const wPL = calcPL(totalRevenue, totalDelivered, totalAdCost);

      document.getElementById('weekly-metrics').innerHTML = `
        <div class="metric-card"><div class="metric-label">Total Orders</div><div class="metric-value">${totalOrders}</div></div>
        <div class="metric-card"><div class="metric-label">Delivered</div><div class="metric-value text-profit">${totalDelivered}</div></div>
        <div class="metric-card"><div class="metric-label">Revenue</div><div class="metric-value">${fmtK(totalRevenue)}</div></div>
        <div class="metric-card"><div class="metric-label">Net P&L</div><div class="metric-value ${wPL.profit >= 0 ? 'text-profit' : 'text-loss'}">${fmtK(wPL.profit)}</div></div>
      `;

      document.getElementById('weekly-breakdown-tbody').innerHTML = daysData.map(dd => `
        <tr>
          <td>${dd.label}</td>
          <td>${dd.orders}</td>
          <td>${dd.delivered}</td>
          <td>${dd.canceled}</td>
          <td class="${dd.profit >= 0 ? 'text-profit' : 'text-loss'}">${fmt(dd.profit)}</td>
        </tr>
      `).join('');

      renderPLTable('weekly', wPL, totalDelivered);

      if (state.charts.weekly) state.charts.weekly.destroy();
      const ctx = document.getElementById('weeklyChart').getContext('2d');
      state.charts.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: daysData.map(d => d.dayLabel),
          datasets: [
            { label: 'Total Orders', data: daysData.map(d => d.orders), backgroundColor: '#1e88e5' },
            { label: 'Delivered', data: daysData.map(d => d.delivered), backgroundColor: '#4caf50' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
            x: { ticks: { color: '#a0a0a0' }, grid: { display: false } }
          },
          plugins: { legend: { labels: { color: '#a0a0a0' } } }
        }
      });
    }

    // RENDERING: MONTHLY
    function renderMonthly(mStart, mEnd) {
      let totalOrders = 0;
      let totalRevenue = 0;
      let totalDelivered = 0;
      let totalCanceled = 0;
      let totalTransit = 0;
      let totalAdCost = 0;
      
      let daysData = [];

      for (var d = new Date(mStart); d <= mEnd; d.setDate(d.getDate() + 1)) {
        const dStr = toDateStr(d);
        const dOrders = state.orders.filter(o => o.created_at && o.created_at.startsWith(dStr));
        const tCounts = categorizeOrders(dOrders);
        const dRev = getTotalRevenue(dOrders);
        const dDel = tCounts['Delivered'] || 0;
        const dAd = state.adCosts[dStr] || 0;

        totalOrders += dOrders.length;
        totalRevenue += dRev;
        totalDelivered += dDel;
        totalCanceled += tCounts['Canceled'] || 0;
        totalTransit += tCounts['In Transit'] || 0;
        totalAdCost += dAd;

        daysData.push({
          day: d.getDate(),
          orders: dOrders.length,
          delivered: dDel
        });
      }

      const mPL = calcPL(totalRevenue, totalDelivered, totalAdCost);

      document.getElementById('monthly-metrics').innerHTML = `
        <div class="metric-card"><div class="metric-label">Total Orders</div><div class="metric-value">${totalOrders}</div></div>
        <div class="metric-card"><div class="metric-label">Delivered</div><div class="metric-value text-profit">${totalDelivered}</div></div>
        <div class="metric-card"><div class="metric-label">In Transit</div><div class="metric-value" style="color:var(--info-color)">${totalTransit}</div></div>
        <div class="metric-card"><div class="metric-label">Canceled</div><div class="metric-value text-loss">${totalCanceled}</div></div>
        <div class="metric-card"><div class="metric-label">Revenue</div><div class="metric-value">${fmtK(totalRevenue)}</div></div>
        <div class="metric-card"><div class="metric-label">Ad Spend</div><div class="metric-value">${fmtK(totalAdCost)}</div></div>
        <div class="metric-card"><div class="metric-label">Net P&L</div><div class="metric-value ${mPL.profit >= 0 ? 'text-profit' : 'text-loss'}">${fmtK(mPL.profit)}</div></div>
      `;

      renderPLTable('monthly', mPL, totalDelivered);

      if (state.charts.monthly) state.charts.monthly.destroy();
      const ctx = document.getElementById('monthlyChart').getContext('2d');
      state.charts.monthly = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: daysData.map(d => d.day),
          datasets: [
            { label: 'Total Orders', data: daysData.map(d => d.orders), backgroundColor: '#1e88e5' },
            { label: 'Delivered', data: daysData.map(d => d.delivered), backgroundColor: '#4caf50' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
            x: { 
              ticks: { color: '#a0a0a0', autoSkip: false, maxRotation: 0, font: { size: 10 } },
              grid: { display: false }
            }
          },
          plugins: { legend: { labels: { color: '#a0a0a0' } } }
        }
      });
    }

    function renderPLTable(prefix, pl, deliveredCount) {
      const bColor = pl.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)';
      const pText = pl.profit >= 0 ? 'Profit' : 'Loss';
      const bStyle = `background: ${bColor}20; color: ${bColor}; border: 1px solid ${bColor}40`;
      
      const badge = document.getElementById(`${prefix}-pl-badge`);
      if(badge) {
        badge.textContent = `${pText}: ${fmt(pl.profit)}`;
        badge.style = bStyle;
      }

      document.getElementById(`${prefix}-pl-table`).innerHTML = `
        <tr><td>Revenue (delivered orders)</td><td>${fmt(pl.revenue)}</td></tr>
        <tr><td>− Product cost (${deliveredCount} units × ₹${PRODUCT_COST})</td><td>${fmt(pl.productCost)}</td></tr>
        <tr><td>− Shipping cost (${deliveredCount} units × ₹${SHIPPING_COST})</td><td>${fmt(pl.shippingCost)}</td></tr>
        <tr><td>− Advertising spend (Sum)</td><td>${fmt(pl.adCost)}</td></tr>
        <tr><td>Total costs</td><td>${fmt(pl.totalCost)}</td></tr>
        <tr class="total-row">
          <td>Net ${pText}</td>
          <td class="${pl.profit >= 0 ? 'text-profit' : 'text-loss'}">${fmt(Math.abs(pl.profit))} ${pl.profit >= 0 ? '▲' : '▼'}</td>
        </tr>
      `;
    }

    // Init
    setupViewInputs();
    updateHeader();
    fetchCurrentView();

