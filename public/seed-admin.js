/* seed-admin.js — Logika upload ALUMNI_DATA ke Supabase dari web UI */

const SEED_BATCH = 500;

function initSeedPanel() {
  const panel = document.getElementById('seedPanel');
  if (!panel) return;
  if (currentUser?.role === 'Administrator') {
    panel.style.display = 'block';
    document.getElementById('seedCount').textContent =
      ALUMNI_DATA.length.toLocaleString('id');
  }
}

// Deteksi login berhasil (loginPage disembunyikan) → tampilkan panel
(function watchLogin() {
  const loginPage = document.getElementById('loginPage');
  if (!loginPage) return;
  const obs = new MutationObserver(() => {
    if (loginPage.classList.contains('hidden')) {
      initSeedPanel();
      obs.disconnect();
    }
  });
  obs.observe(loginPage, { attributes: true, attributeFilter: ['class'] });
})();

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

    msg.textContent = `✅ ${inserted.toLocaleString('id')} alumni berhasil diupload ke Supabase.`;
    msg.style.color = '#22c55e';
    alert(`Berhasil! ${inserted.toLocaleString('id')} alumni telah disimpan di Supabase.`);

    if (typeof loadDB === 'function') {
      await loadDB();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderTable === 'function') renderTable();
    }
  } catch (err) {
    msg.textContent = '❌ Gagal: ' + err.message;
    msg.style.color = '#ef4444';
    console.error('[Seed]', err);
  } finally {
    btnSeed.disabled = false;
  }
}
