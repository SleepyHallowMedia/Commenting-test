import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SB_URL')!
const ANON_KEY = Deno.env.get('SB_ANON_KEY')! 
const supabase = createClient(SUPABASE_URL, ANON_KEY)

function cors(res: Response) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers','content-type, authorization, apikey, x-client-info, x-supabase-api-version')
  return res
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
  try {
    const { page_id, body, author_name, fingerprint } = await req.json()
    const trimmed = (body || '').trim()
    if (!page_id || !trimmed) return cors(new Response(JSON.stringify({ error:'Invalid payload' }), { status:400 }))

    const { error } = await supabase.from('comments').insert({
      page_id,
      body: trimmed,
      author_name: (author_name && String(author_name).slice(0,80)) || 'Guest',
      author_id: null
    })
    if (error) throw error
    return cors(new Response(JSON.stringify({ ok:true }), { status:200 }))
  } catch (e) {
    console.error(e)
    return cors(new Response(JSON.stringify({ error:'Server error' }), { status:500 }))
  }
})