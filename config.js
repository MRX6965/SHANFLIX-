/* Optional cloud sync (Supabase). Leave empty to keep everything local.
   See SETUP.md → "Cloud sync". The anon key is safe to expose; row-level security protects data. */
window.SHANFLIX_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  plausibleDomain: ""   // e.g. "shanflix.vercel.app" to enable Plausible analytics
};
