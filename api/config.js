// Vercel Serverless Function: /api/config
// Returns public Supabase config from env vars so the frontend never has hardcoded keys.
module.exports = (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars in Vercel' });
  }

  // These are safe to expose — Supabase anon keys are designed to be public,
  // protected by Row Level Security policies on the database side.
  res.setHeader('Cache-Control', 's-maxage=3600'); // Cache for 1 hour on CDN
  res.status(200).json({ supabaseUrl, supabaseAnonKey });
};
