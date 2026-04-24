/**
 * seed.js — Upload data alumni dari Excel ke Supabase
 *
 * Cara pakai:
 *   node seed.js                        → upload dari file Excel
 *   node seed.js --preview              → tampilkan 5 baris pertama tanpa upload
 *   node seed.js --truncate             → hapus semua data lama dulu, lalu upload
 *   node seed.js --sheet "Sheet2"       → pilih sheet tertentu
 */

const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();

// ── Konfigurasi ──────────────────────────────────────────────────
const EXCEL_FILE  = path.join(__dirname, 'Alumni 2000-2025 (1).xlsx');
const BATCH_SIZE  = 500;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const args      = process.argv.slice(2);
const PREVIEW   = args.includes('--preview');
const TRUNCATE  = args.includes('--truncate');
const sheetIdx  = args.indexOf('--sheet');
const SHEET_NAME = sheetIdx !== -1 ? args[sheetIdx + 1] : null;

// ── Validasi ──────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n❌ SUPABASE_URL atau SUPABASE_SERVICE_KEY tidak ditemukan di .env\n');
  process.exit(1);
}
if (!fs.existsSync(EXCEL_FILE)) {
  console.error(`\n❌ File tidak ditemukan: ${EXCEL_FILE}\n`);
  process.exit(1);
}

// ── Mapping kolom Excel → kolom Supabase ─────────────────────────
// Sesuaikan daftar ini jika nama kolom di Excel berbeda
const COLUMN_MAP = {
  nama:           ['Nama Lulusan', 'Nama', 'NAMA', 'nama', 'Nama Mahasiswa', 'Nama Alumni', 'Name'],
  nim:            ['NIM', 'nim', 'No. Induk', 'Nomor Induk', 'No Induk'],
  tahun_masuk:    ['Tahun Masuk', 'tahun_masuk', 'Angkatan', 'TA Masuk', 'T.Masuk'],
  tanggal_lulus:  ['Tanggal Lulus', 'tanggal_lulus', 'Tgl Lulus', 'Lulus', 'Tahun Lulus', 'TA Lulus'],
  fakultas:       ['Fakultas', 'FAKULTAS', 'fakultas', 'Fak'],
  prodi:          ['Program Studi', 'Prodi', 'prodi', 'PRODI', 'Jurusan', 'PS', 'Prog. Studi'],
  linkedin:       ['LinkedIn', 'linkedin'],
  ig:             ['Instagram', 'IG', 'ig'],
  fb:             ['Facebook', 'FB', 'fb'],
  tiktok:         ['TikTok', 'tiktok'],
  email:          ['Email', 'E-mail', 'email', 'EMAIL'],
  hp:             ['HP', 'No HP', 'Telepon', 'No. HP', 'hp', 'Phone'],
  kerja:          ['Kerja', 'Tempat Kerja', 'Perusahaan', 'Instansi', 'kerja'],
  posisi:         ['Posisi', 'Jabatan', 'posisi'],
  status:         ['Status', 'status', 'Status Kerja'],
  alamat_kerja:   ['Alamat Kerja', 'alamat_kerja', 'Kota Kerja', 'Alamat'],
  kerja_linkedin: ['LinkedIn Kerja', 'kerja_linkedin'],
  kerja_ig:       ['IG Kerja', 'kerja_ig'],
  kerja_fb:       ['FB Kerja', 'kerja_fb'],
  kerja_web:      ['Website', 'Web Kerja', 'kerja_web'],
};

function getVal(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function mapRow(row) {
  const mapped = { ai_searched: false };
  for (const [field, keys] of Object.entries(COLUMN_MAP)) {
    mapped[field] = getVal(row, keys);
  }
  return mapped;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n📂 Membaca file Excel...');
  const wb    = XLSX.readFile(EXCEL_FILE);
  const sName = SHEET_NAME || wb.SheetNames[0];
  if (!wb.SheetNames.includes(sName)) {
    console.error(`❌ Sheet "${sName}" tidak ditemukan. Sheet tersedia: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const ws   = wb.Sheets[sName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  console.log(`✅ Sheet: "${sName}" | Total baris: ${rows.length}`);
  console.log(`   Kolom yang ditemukan: ${Object.keys(rows[0] || {}).join(', ')}\n`);

  const records = rows.map(mapRow).filter(r => r.nama !== '');
  console.log(`📋 ${records.length} alumni siap diupload (${rows.length - records.length} baris kosong dilewati)\n`);

  if (PREVIEW) {
    console.log('👀 Preview 5 data pertama:');
    console.table(records.slice(0, 5).map(r => ({
      nama:    r.nama,
      nim:     r.nim,
      lulus:   r.tanggal_lulus,
      fakultas:r.fakultas,
      prodi:   r.prodi,
    })));
    console.log('\n(Gunakan tanpa --preview untuk mulai upload)\n');
    return;
  }

  if (TRUNCATE) {
    console.log('🗑️  Menghapus data lama di Supabase...');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/alumni?id=gte.0`, {
      method:  'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('❌ Gagal hapus data lama:', t);
      process.exit(1);
    }
    console.log('✅ Data lama berhasil dihapus\n');
  }

  const total   = records.length;
  const batches = Math.ceil(total / BATCH_SIZE);
  let inserted  = 0;

  console.log(`🚀 Mulai upload ${total} alumni dalam ${batches} batch (${BATCH_SIZE}/batch)...\n`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const bNum  = Math.floor(i / BATCH_SIZE) + 1;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/alumni`, {
      method:  'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error(`\n❌ Batch ${bNum}/${batches} GAGAL: ${txt}\n`);
      process.exit(1);
    }

    inserted += batch.length;
    const pct = Math.round((inserted / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`\r  [${bar}] ${pct}% — ${inserted}/${total} alumni`);
  }

  console.log(`\n\n✅ Selesai! ${inserted} alumni berhasil dimasukkan ke Supabase.\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
