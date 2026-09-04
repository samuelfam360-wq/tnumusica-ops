export default async function handler(req, res) {
  return res.status(200).json({
    anthropicKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    supabaseUrlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKeyConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
