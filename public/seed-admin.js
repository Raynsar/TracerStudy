/* seed-admin.js — Upload ke Supabase + Batch AI dari web UI */

const SEED_BATCH = 500;
let batchAiRunning  = false;
let batchAiStopped  = false;
let batchAiTotal    = 0;

// ── Tampilkan panel admin setelah login berhasil ──────────────────
(function watchLogin() {
  const loginPage = document.getElementById('loginPage');
  if (!loginPage) return;

  // doLogin() pakai style.display, bukan classList — pantau atribut style
  const obs = new MutationObserver(() => {
    if (loginPage.style.display === 'none') {
      initAdminPanels();
      obs.disconnect();
    }
  });
  obs.observe(loginPage, { attributes: true, attributeFilter: ['style'] });
})();

function initAdminPanels() {
  if (currentUser?.role !== 'Administrator') return;

  // Panel upload lokal
  const seedPanel = document.getElementById('seedPanel');
  if (seedPanel) {
    seedPanel.style.display = 'block';
    document.getElementById('seedCount').textContent =
      ALUMNI_DATA.length.toLocaleString('id');
  }

  // Panel batch AI
  const batchPanel = document.getElementById('batchAiPanel');
  if (batchPanel) batchPanel.style.display = 'block';

  // Wrapper adminPanels
  const wrap = document.getElementById('adminPanels');
  if (wrap) wrap.style.display = 'block';
}


/* ================================================================
   UPLOAD DATA LOKAL KE SUPABASE
   ================================================================ */
async function seedToSupabase() {
  const btnSeed  = document.getElementById('btnSeed');
  const progress = document.getElementById('seedProgress');
  const bar      = document.getElementById('seedBar');
  const msg      = document.getElementById('seedMsg');
  const total    = ALUMNI_DATA.length;
  const batches  = Math.ceil(total / SEED_BATCH);

  if (!confirm(
    `Ini akan menambahkan ${total.toLocaleString('id')} alumni ke Supabase.\n` +
    `Data yang sudah ada TIDAK dihapus.\n\nLanjutkan?`
  )) return;

  btnSeed.disabled       = true;
  progress.style.display = 'block';
  bar.style.width        = '0%';
  bar.style.background   = 'var(--accent, #6366f1)';
  msg.style.color        = '';
  msg.textContent        = 'Memulai upload...';

  try {
    let inserted = 0;
    for (let i = 0; i < total; i += SEED_BATCH) {
      const batch = ALUMNI_DATA.slice(i, i + SEED_BATCH);
      const bNum  = Math.floor(i / SEED_BATCH) + 1;

      msg.textContent =
        `Batch ${bNum}/${batches} — ${inserted + batch.length}/${total} alumni...`;

      const res = await fetch('/api/alumni/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ records: batch })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status} pada batch ${bNum}`);
      }

      inserted += batch.length;
      bar.style.width = Math.round((inserted / total) * 100) + '%';
    }

    msg.textContent = `✅ ${inserted.toLocaleString('id')} alumni berhasil diupload.`;
    msg.style.color = '#22c55e';
    alert(`Berhasil! ${inserted.toLocaleString('id')} alumni telah disimpan di Supabase.`);

    await renderDashboard();
    await renderTable();
  } catch (err) {
    msg.textContent = '❌ Gagal: ' + err.message;
    msg.style.color = '#ef4444';
    console.error('[Seed]', err);
  } finally {
    btnSeed.disabled = false;
  }
}


/* ================================================================
   BATCH AI — Isi data otomatis untuk semua alumni belum diproses
   ================================================================ */
async function startBatchAi() {
  if (batchAiRunning) return;
  batchAiRunning = true;
  batchAiStopped = false;

  const btnStart   = document.getElementById('btnBatchAi');
  const btnStop    = document.getElementById('btnStopAi');
  const progress   = document.getElementById('aiProgress');
  const bar        = document.getElementById('aiBar');
  const msg        = document.getElementById('aiMsg');
  const batchSize  = parseInt(document.getElementById('batchSize').value) || 5;

  btnStart.disabled    = true;
  btnStop.style.display = 'inline-block';
  progress.style.display = 'block';
  bar.style.width      = '0%';
  msg.style.color      = '';
  msg.textContent      = 'Menghitung sisa alumni yang belum diproses...';

  // Hitung total yang belum diproses
  try {
    const check = await fetch('/api/alumni?ai_searched=false&page=1&per_page=1');
    const data  = await check.json();
    batchAiTotal = data.total || 0;
    msg.textContent = `${batchAiTotal.toLocaleString('id')} alumni belum diproses. Memulai...`;
  } catch (e) {
    msg.textContent = '❌ Gagal cek data: ' + e.message;
    resetBatchAiUI();
    return;
  }

  let totalProcessed = 0;

  while (!batchAiStopped) {
    try {
      const res = await fetch('/api/batch-ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ batch_size: batchSize })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data.ok) throw new Error(data.error || 'Batch gagal');

      totalProcessed += data.processed;
      const remaining = data.remaining;
      const done      = batchAiTotal - remaining;
      const pct       = batchAiTotal > 0 ? Math.round((done / batchAiTotal) * 100) : 100;

      bar.style.width = pct + '%';
      msg.textContent =
        `[${data.provider}] Diproses: ${totalProcessed.toLocaleString('id')} — ` +
        `Sisa: ${remaining.toLocaleString('id')} — ${pct}%`;

      if (remaining === 0) {
        msg.textContent = `✅ Selesai! ${totalProcessed.toLocaleString('id')} alumni telah diisi data AI.`;
        msg.style.color = '#22c55e';
        await renderDashboard();
        break;
      }

      // Tunggu sebentar agar tidak kena rate-limit API
      await new Promise(r => setTimeout(r, 1500));

    } catch (e) {
      msg.textContent = '❌ Error: ' + e.message + ' — coba lagi dalam 10 detik...';
      msg.style.color = '#f59e0b';
      await new Promise(r => setTimeout(r, 10000));
      msg.style.color = '';
    }
  }

  if (batchAiStopped) {
    msg.textContent = `⏸ Dihentikan. ${totalProcessed.toLocaleString('id')} alumni sudah diproses sesi ini.`;
  }

  resetBatchAiUI();
}

function stopBatchAi() {
  batchAiStopped = true;
}

function resetBatchAiUI() {
  batchAiRunning = false;
  const btnStart = document.getElementById('btnBatchAi');
  const btnStop  = document.getElementById('btnStopAi');
  if (btnStart) btnStart.disabled = false;
  if (btnStop)  btnStop.style.display = 'none';
}
