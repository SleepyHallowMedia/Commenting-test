
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
function cors(res: Response) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set(
    'Access-Control-Allow-Headers',
    'content-type, authorization, apikey, x-client-info, x-supabase-api-version'
  )
  return res
}
serve(async (req)=>{ if (req.method==='OPTIONS') return cors(new Response(null,{status:204}))
  try { const { comment_id, value, fingerprint } = await req.json()
    if (!comment_id || ![1,-1].includes(Number(value))) return cors(new Response(JSON.stringify({ error:'Invalid payload' }), { status:400 }))
    const fp = String(fingerprint||'').slice(0,64); if (!fp) return cors(new Response(JSON.stringify({ error:'Missing fingerprint' }), { status:400 }))
    const { error } = await supabase.from('comment_votes').upsert({ comment_id: Number(comment_id), voter_fingerprint: fp, value: Number(value) }, { onConflict:'comment_id,voter_fingerprint' })
    if (error) throw error
    return cors(new Response(JSON.stringify({ ok:true }), { status:200 }))
  } catch (e) { console.error(e); return cors(new Response(JSON.stringify({ error:'Server error' }), { status:500 })) }
})
