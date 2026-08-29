window.CAPITALNEST_SUPABASE = Object.assign({
  url: 'https://mohigobcssqzywmhndml.supabase.co',
  anonKey: 'sb_publishable_MRVoyKc48ERptjd1G9l08g_3YTAleje'
}, window.CAPITALNEST_SUPABASE || {});

if (!window.CAPITALNEST_SUPABASE.url || !window.CAPITALNEST_SUPABASE.anonKey) {
  console.error('Supabase config is missing the project URL or anon key.');
}
