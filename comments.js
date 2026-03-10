
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CONFIG } from './config.js'
const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
export async function initComments(opts = {}) {
  const root = document.getElementById('comments-root'); if (!root) throw new Error('#comments-root not found')
  const pageId = opts.pageId || CONFIG.pageId || location.pathname
  root.innerHTML = `
    <div class="comments-card">
      <div class="comments-row" id="auth-row">
        <button id="login-btn" class="link">Sign in with GitHub</button>
        <span id="user-label" class="count-badge"></span>
        <button id="logout-btn" class="link" style="display:none">Sign out</button>
      </div>
      <div id="composer" style="margin-top:12px">
        <div class="comments-row" style="margin-bottom:8px">
          <input id="author_name" class="name-input" placeholder="Name (optional)" />
        </div>
        <textarea id="comment_body" class="comment-input" placeholder="Write a comment..."></textarea>
        <div class="comments-row" style="justify-content:space-between; margin-top:8px">
          <div class="count-badge">This thread is for <code>${escapeHtml(pageId)}</code></div>
          <div><button id="post-btn" class="primary">Post</button></div>
        </div>
      </div>
    </div>
    <div class="comments-card">
      <div class="comments-row" style="justify-content:space-between">
        <strong>Comments</strong>
        <span id="total-count" class="count-badge"></span>
      </div>
      <div id="list"></div>
    </div>`
  const loginBtn = document.getElementById('login-btn'); const logoutBtn = document.getElementById('logout-btn'); const userLabel = document.getElementById('user-label')
  async function updateAuthUI(){ const { data:{ user } } = await supabase.auth.getUser(); userLabel.textContent = user ? `Signed in as ${user.email ?? user.user_metadata?.user_name ?? 'User'}` : ''; loginBtn.style.display = user ? 'none':'inline-block'; logoutBtn.style.display = user ? 'inline-block':'none' }
  loginBtn.addEventListener('click', async ()=>{ await supabase.auth.signInWithOAuth({ provider:'github', options:{ redirectTo: window.location.href }}) })
  logoutBtn.addEventListener('click', async ()=>{ await supabase.auth.signOut(); await updateAuthUI() })
  supabase.auth.onAuthStateChange(updateAuthUI); await updateAuthUI()
  async function loadComments(){ const { data, error } = await supabase.from('comments').select('id, body, created_at, author_name, author_id').eq('page_id', pageId).eq('deleted', false).order('created_at', { ascending:false }); if (error){ console.error(error); return } renderComments(data||[]) }
  function renderComments(list){ const container = document.getElementById('list'); container.innerHTML=''; document.getElementById('total-count').textContent = `${list.length} total`; for(const c of list){ const el = document.createElement('div'); el.className='comment-item'; const when = new Date(c.created_at).toLocaleString(); el.innerHTML = `<div class="comment-meta">${escapeHtml(c.author_name ?? 'User')} • ${when}</div><div class="comment-body">${escapeHtml(c.body)}</div><div class="comments-row comments-actions" style="margin-top:6px"><button class="like" data-id="${c.id}">👍 Like</button><button class="dislike" data-id="${c.id}">👎 Dislike</button><span id="score-${c.id}" class="count-badge"></span></div>`; container.appendChild(el) } refreshScores(list.map(x=>x.id)) }
  document.getElementById('post-btn').addEventListener('click', async ()=>{ const body = document.getElementById('comment_body').value.trim(); const authorName = document.getElementById('author_name').value.trim() || null; if (!body) return alert('Please write something'); const { data:{ user } } = await supabase.auth.getUser(); if (CONFIG.mode==='auth-only'){ if (CONFIG.requireLoginToComment && !user) return alert('Please sign in to comment'); const insert={ page_id:pageId, body, author_name: user? null: (authorName||'Guest'), author_id: user? user.id : null }; const { error } = await supabase.from('comments').insert(insert); if (error) return alert(error.message) } else { const fp = getFingerprint(); const { error } = await supabase.functions.invoke('comment', { body:{ page_id:pageId, body, author_name:authorName, fingerprint: fp } }); if (error) return alert(error.message) } document.getElementById('comment_body').value=''; await loadComments() })
  document.getElementById('list').addEventListener('click', async (e)=>{ const btn = e.target.closest('button'); if (!btn) return; const id = Number(btn.dataset.id); if (btn.classList.contains('like')) await vote(id,1); if (btn.classList.contains('dislike')) await vote(id,-1) })
  async function vote(commentId, value){ const { data:{ user } } = await supabase.auth.getUser(); if (CONFIG.mode==='auth-only'){ if (CONFIG.requireLoginToVote && !user) return alert('Please sign in to vote'); const { error } = await supabase.from('comment_votes').upsert({ comment_id: commentId, voter_id: user?.id ?? null, value }, { onConflict:'comment_id,voter_id' }); if (error) return alert(error.message) } else { const fp = getFingerprint(); const { error } = await supabase.functions.invoke('vote', { body:{ comment_id: commentId, value, fingerprint: fp } }); if (error) return alert(error.message) } await refreshScores([commentId]) }
  async function refreshScores(ids){ if (!ids.length) return; const { data, error } = await supabase.from('comment_votes').select('comment_id, value').in('comment_id', ids); if (error) return console.error(error); const map = new Map(); for(const row of (data||[])){ const { comment_id, value } = row; if (!map.has(comment_id)) map.set(comment_id, { likes:0, dislikes:0 }); if (value===1) map.get(comment_id).likes++; if (value===-1) map.get(comment_id).dislikes++ } for(const id of ids){ const s = map.get(id) || { likes:0, dislikes:0 }; const el = document.getElementById(`score-${id}`); if (el) el.textContent = ` ${s.likes} / ${s.dislikes}` } }
  supabase.channel('comments-'+pageId).on('postgres_changes', { event:'INSERT', schema:'public', table:'comments', filter:`page_id=eq.${pageId}`}, async ()=>{ await loadComments() }).subscribe()
  await loadComments()
}
function getFingerprint(){ const key='comments_fingerprint'; let fp = localStorage.getItem(key); if (!fp){ fp = cryptoRandom(); localStorage.setItem(key, fp) } return fp }
function cryptoRandom(){ const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('') }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',''':'&#039;'}[m])) }
if (document.getElementById('comments-root')) { initComments().catch(console.error) }
