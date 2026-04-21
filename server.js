/**
 * ============================================================
 *  TracerStudy Alumni — Backend Proxy Server
 *  File    : server.js
 *
 *  Mendukung 3 provider AI (dipilih otomatis berdasarkan .env):
 *    1. Google Gemini  — GRATIS  (GEMINI_API_KEY)
 *    2. Groq           — GRATIS  (GROQ_API_KEY)
 *    3. Anthropic      — Berbayar(ANTHROPIC_API_KEY)
 *
 *  Prioritas: Gemini → Groq → Anthropic
 *
 *  Cara pakai:
 *    1. npm install
 *    2. cp .env.example .env  →  isi minimal satu AI key
 *    3. node server.js
 *    4. Buka http://localhost:3000
 * ============================================================
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));


/* ============================================================
   PROMPT TEMPLATE — dipakai semua provider
   ============================================================ */
const SYSTEM_PROMPT = `Kamu adalah asisten riset tracer study alumni universitas Indonesia.
Tugasmu: berdasarkan nama dan latar belakang pendidikan alumni, cari atau perkirakan
data kontak dan pekerjaan yang REALISTIS dan MASUK AKAL.

PANDUAN mengisi setiap field:
- linkedin      : URL profil LinkedIn (contoh: linkedin.com/in/namanya)
- ig            : username Instagram dengan @ (contoh: @nama.alumni)
- fb            : URL Facebook (contoh: facebook.com/namanya)
- tiktok        : username TikTok dengan @ (contoh: @namanya)
- email         : email pribadi yang masuk akal (gmail/yahoo berdasarkan nama)
- hp            : nomor HP Indonesia format +62 8xx-xxxx-xxxx
- kerja         : nama instansi/perusahaan tempat bekerja saat ini
- posisi        : jabatan sesuai latar belakang prodi
- status        : salah satu dari "PNS", "Swasta", atau "Wirausaha"
- alamat_kerja  : kota dan provinsi tempat bekerja
- kerja_linkedin: LinkedIn page perusahaan (contoh: linkedin.com/company/nama)
- kerja_ig      : Instagram perusahaan (contoh: @namainstansi)
- kerja_fb      : Facebook perusahaan
- kerja_web     : website resmi perusahaan (contoh: www.perusahaan.co.id)

ATURAN WAJIB:
- Isi SEMUA field, jangan ada yang kosong kecuali sosmed perusahaan yang tidak ada
- email dan hp HARUS diisi (buat yang masuk akal dari nama alumni)
- status HARUS salah satu dari: PNS, Swasta, atau Wirausaha
- Gunakan panduan prodi berikut:
  * FKIP/Pendidikan  → guru/dosen, banyak PNS di SDN/SMPN/SMAN atau universitas
  * Ekonomi/Akuntansi→ akuntan/finance, Bank BRI/BNI/Mandiri, atau wirausaha
  * Teknik           → engineer di perusahaan swasta, PT PLN, Telkom, atau startup
  * Hukum            → pengacara, notaris, PNS di kejaksaan/pengadilan
  * Kesehatan/Farmasi→ perawat/dokter/apoteker di RS/puskesmas/klinik
  * Sosial/ISIP      → pegawai pemerintah, jurnalis, NGO, atau konsultan
  * Psikologi        → HR di perusahaan, konselor, atau klinik psikologi
  * Pertanian        → penyuluh pertanian (PNS), perusahaan agribisnis, atau petani mandiri

Kembalikan HANYA JSON valid, tanpa teks lain, tanpa markdown:
{
  "linkedin":"","ig":"","fb":"","tiktok":"",
  "email":"","hp":"",
  "kerja":"","posisi":"","status":"","alamat_kerja":"",
  "kerja_linkedin":"","kerja_ig":"","kerja_fb":"","kerja_web":""
}`;

function buildUserPrompt(alumni) {
  return `Isi data untuk alumni berikut:

Nama    : ${alumni.nama}
NIM     : ${alumni.nim || '-'}
Lulus   : ${alumni.tanggal_lulus || '-'}
Fakultas: ${alumni.fakultas || '-'}
Prodi   : ${alumni.prodi || '-'}

Kembalikan JSON sesuai format yang diminta. Semua field wajib diisi.`;
}

/** Bersihkan dan parse JSON dari teks respons AI */
function parseJSON(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Format JSON tidak ditemukan dalam respons AI');
  const result = JSON.parse(match[0]);
  // Normalisasi nilai literal "kosong" / "-"
  const EMPTY = new Set(['kosong', 'tidak ditemukan', '-', 'n/a', 'none', '']);
  Object.keys(result).forEach(k => {
    if (EMPTY.has((result[k] || '').toString().trim().toLowerCase())) result[k] = '';
  });
  return result;
}


/* ============================================================
   PROVIDER 1: Google Gemini (GRATIS)
   Daftar key: https://aistudio.google.com/app/apikey
   ============================================================ */
async function searchWithGemini(alumni) {
  const KEY   = process.env.GEMINI_API_KEY;
  const MODEL = 'gemini-2.0-flash';
  const URL   = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: buildUserPrompt(alumni) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  };

  const r = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error('Gemini: ' + (e.error?.message || `HTTP ${r.status}`));
  }

  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini: respons kosong');
  return parseJSON(text);
}


/* ============================================================
   PROVIDER 2: Groq (GRATIS — llama3 70b)
   Daftar key: https://console.groq.com/keys
   ============================================================ */
async function searchWithGroq(alumni) {
  const KEY = process.env.GROQ_API_KEY;

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens:  1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(alumni) }
      ]
    })
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error('Groq: ' + (e.error?.message || `HTTP ${r.status}`));
  }

  const data = await r.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Groq: respons kosong');
  return parseJSON(text);
}


/* ============================================================
   PROVIDER 3: Anthropic Claude (Berbayar — dengan web_search)
   Daftar key: https://console.anthropic.com/settings/keys
   ============================================================ */
async function searchWithAnthropic(alumni) {
  const KEY     = process.env.ANTHROPIC_API_KEY;
  const queries = [];
  let messages  = [{ role: 'user', content: buildUserPrompt(alumni) }];
  let finalText = '';
  let loops     = 0;

  const tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  while (loops < 12) {
    loops++;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system:     SYSTEM_PROMPT,
        tools,
        messages
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error('Anthropic: ' + (e.error?.message || `HTTP ${r.status}`));
    }

    const data      = await r.json();
    const textBlocks = data.content.filter(b => b.type === 'text');
    const toolBlocks = data.content.filter(b => b.type === 'tool_use');

    if (textBlocks.length) finalText = textBlocks.map(b => b.text).join('\n');
    if (data.stop_reason === 'end_turn' || !toolBlocks.length) break;

    toolBlocks.forEach(tb => {
      const q = tb.input?.query || JSON.stringify(tb.input);
      queries.push(q);
      console.log(`  [Anthropic Web Search] "${q}"`);
    });

    messages.push({ role: 'assistant', content: data.content });
    messages.push({
      role:    'user',
      content: toolBlocks.map(tb => ({ type: 'tool_result', tool_use_id: tb.id, content: '' }))
    });
  }

  if (!finalText) throw new Error('Anthropic: tidak ada teks respons');
  return { result: parseJSON(finalText), queries };
}


/* ============================================================
   ENDPOINT: POST /api/ai-search
   Otomatis pilih provider berdasarkan key yang tersedia di .env
   ============================================================ */
app.post('/api/ai-search', async (req, res) => {
  const { alumni } = req.body;
  if (!alumni?.nama) return res.status(400).json({ error: 'Data alumni tidak lengkap' });

  // Deteksi provider
  const hasGemini    = !!process.env.GEMINI_API_KEY;
  const hasGroq      = !!process.env.GROQ_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!hasGemini && !hasGroq && !hasAnthropic) {
    return res.status(500).json({
      error: 'Tidak ada AI API key yang dikonfigurasi di .env. ' +
             'Isi salah satu: GEMINI_API_KEY (gratis), GROQ_API_KEY (gratis), atau ANTHROPIC_API_KEY'
    });
  }

  const provider = hasGemini ? 'Gemini' : hasGroq ? 'Groq' : 'Anthropic';
  console.log(`[AI Search] ${provider} | Mencari: ${alumni.nama} (${alumni.prodi})`);

  try {
    let result, queries = [];

    if (hasGemini) {
      result = await searchWithGemini(alumni);
    } else if (hasGroq) {
      result = await searchWithGroq(alumni);
    } else {
      const r = await searchWithAnthropic(alumni);
      result  = r.result;
      queries = r.queries;
    }

    console.log(`[AI Search] ✓ ${alumni.nama} → ${result.kerja || '(tidak ada)'} | ${result.status || '?'}`);
    res.json({ ok: true, data: result, queries, provider });

  } catch (err) {
    console.error(`[AI Search] ✗ ${alumni.nama}:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ============================================================
//  ENDPOINT: POST /api/login
//  Validasi login dari tabel app_users di Supabase
// ============================================================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Fallback: akun hardcoded jika Supabase belum dikonfigurasi
    const FALLBACK = {
      admin:    { pass: 'admin123',  role: 'Administrator' },
      operator: { pass: 'op2024',    role: 'Operator' },
      viewer:   { pass: 'view2024',  role: 'Viewer' }
    };
    if (FALLBACK[username] && FALLBACK[username].pass === password) {
      return res.json({ ok: true, role: FALLBACK[username].role, username });
    }
    return res.status(401).json({ ok: false, error: 'Username atau password salah' });
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/app_users?username=eq.${username}&password=eq.${password}&select=username,role`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    if (rows.length > 0) {
      res.json({ ok: true, role: rows[0].role, username: rows[0].username });
    } else {
      res.status(401).json({ ok: false, error: 'Username atau password salah' });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ============================================================
//  ENDPOINT: GET /api/alumni
//  Ambil data alumni dari Supabase dengan pagination & filter
// ============================================================
app.get('/api/alumni', async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'Supabase belum dikonfigurasi' });
  }

  const { page = 1, per_page = 25, search = '', fakultas = '', status = '' } = req.query;
  const offset = (page - 1) * per_page;

  let filters = [];
  if (search)   filters.push(`nama=ilike.*${search}*`);
  if (fakultas) filters.push(`fakultas=eq.${encodeURIComponent(fakultas)}`);
  if (status)   filters.push(`status=eq.${status}`);

  const filterStr = filters.length ? '&' + filters.join('&') : '';
  const url = `${SUPABASE_URL}/rest/v1/alumni?select=*${filterStr}&order=id&offset=${offset}&limit=${per_page}`;

  try {
    const r = await fetch(url, {
      headers: {
        apikey:          SUPABASE_KEY,
        Authorization:   `Bearer ${SUPABASE_KEY}`,
        'Range-Unit':    'items',
        'Range':         `${offset}-${parseInt(offset) + parseInt(per_page) - 1}`,
        'Prefer':        'count=exact'
      }
    });

    const total = parseInt(r.headers.get('Content-Range')?.split('/')[1] || '0');
    const rows  = await r.json();
    res.json({ ok: true, data: rows, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ============================================================
//  ENDPOINT: PATCH /api/alumni/:id
//  Update data alumni (hasil AI search atau edit manual)
// ============================================================
app.patch('/api/alumni/:id', async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'Supabase belum dikonfigurasi' });
  }

  const { id }      = req.params;
  const updateData  = { ...req.body, updated_at: new Date().toISOString() };

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alumni?id=eq.${id}`,
      {
        method:  'PATCH',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer':       'return=representation'
        },
        body: JSON.stringify(updateData)
      }
    );
    const rows = await r.json();
    res.json({ ok: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ============================================================
//  ENDPOINT: GET /api/stats
//  Statistik ringkasan dari view alumni_stats
// ============================================================
app.get('/api/stats', async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'Supabase belum dikonfigurasi' });
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/alumni_stats?select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    res.json({ ok: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   TracerStudy Alumni — Server berjalan           ║
║   http://localhost:${PORT}                          ║
╚══════════════════════════════════════════════════╝
  `);
});
