// Supabase connection for shared data (questions & votes).
// The anon key is designed to be public; access is limited by row-level security (see supabase/schema.sql).
// Leave empty to run the Questions page in browser-only preview mode.
window.BW_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
