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
    const { comment_id, value, fingerprint } = await req.json()
    const val = Number(value)
    const fp = String(fingerprint || '').slice(0,64)
    if (!comment_id || ![1,-1].includes(val) || !fp) {
      return cors(new Response(JSON.stringify({ error:'Invalid payload' }), { status:400 }))
    }

    const { error } = await supabase.from('comment_votes').upsert(
      { comment_id: Number(comment_id), voter_fingerprint: fp, value: val },
      { onConflict: 'comment_id,voter_fingerprint' }
    )
    if (error) throw error
    return cors(new Response(JSON.stringify({ ok:true }), { status:200 }))
  } catch (e) {
    console.error(e)
    return cors(new Response(JSON.stringify({ error:'Server error' }), { status:500 }))
  }
})