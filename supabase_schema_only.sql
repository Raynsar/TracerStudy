-- ============================================================
--  TracerStudy — SCHEMA ONLY (tanpa data)
--  Jalankan file ini DULU di Supabase SQL Editor
--  Setelah itu jalankan upload_to_supabase.py untuk data
-- ============================================================

CREATE TABLE IF NOT EXISTS alumni (
  id              SERIAL PRIMARY KEY,
  nama            TEXT        NOT NULL,
  nim             TEXT        DEFAULT '',
  tahun_masuk     TEXT        DEFAULT '',
  tanggal_lulus   TEXT        DEFAULT '',
  fakultas        TEXT        DEFAULT '',
  prodi           TEXT        DEFAULT '',
  linkedin        TEXT        DEFAULT '',
  ig              TEXT        DEFAULT '',
  fb              TEXT        DEFAULT '',
  tiktok          TEXT        DEFAULT '',
  email           TEXT        DEFAULT '',
  hp              TEXT        DEFAULT '',
  kerja           TEXT        DEFAULT '',
  posisi          TEXT        DEFAULT '',
  status          TEXT        DEFAULT '',
  alamat_kerja    TEXT        DEFAULT '',
  kerja_linkedin  TEXT        DEFAULT '',
  kerja_ig        TEXT        DEFAULT '',
  kerja_fb        TEXT        DEFAULT '',
  kerja_web       TEXT        DEFAULT '',
  ai_searched     BOOLEAN     DEFAULT FALSE,
  updated_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_users (username, password, role) VALUES
  ('admin',    'admin123', 'Administrator'),
  ('operator', 'op2024',   'Operator'),
  ('viewer',   'view2024', 'Viewer')
ON CONFLICT (username) DO NOTHING;

ALTER TABLE alumni    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_alumni"
  ON alumni FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "all_app_users"
  ON app_users FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_alumni_nama     ON alumni (nama);
CREATE INDEX IF NOT EXISTS idx_alumni_fakultas ON alumni (fakultas);
CREATE INDEX IF NOT EXISTS idx_alumni_status   ON alumni (status);
CREATE INDEX IF NOT EXISTS idx_alumni_prodi    ON alumni (prodi);

CREATE OR REPLACE VIEW alumni_stats AS
SELECT
  COUNT(*)                                      AS total,
  COUNT(*) FILTER (WHERE status='PNS')          AS pns,
  COUNT(*) FILTER (WHERE status='Swasta')       AS swasta,
  COUNT(*) FILTER (WHERE status='Wirausaha')    AS wirausaha,
  COUNT(*) FILTER (WHERE ai_searched=TRUE)      AS sudah_dicari,
  COUNT(*) FILTER (WHERE email<>'')             AS punya_email,
  COUNT(*) FILTER (WHERE hp<>'')                AS punya_hp,
  COUNT(*) FILTER (WHERE kerja<>'')             AS punya_kerja,
  COUNT(*) FILTER (WHERE linkedin<>'')          AS punya_linkedin,
  COUNT(*) FILTER (WHERE ig<>'')                AS punya_ig,
  COUNT(*) FILTER (WHERE tiktok<>'')            AS punya_tiktok
FROM alumni;

-- Cek hasil:
SELECT 'Schema berhasil dibuat!' AS status;
