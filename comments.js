// Comments + Likes widget
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CONFIG } from './config.js'

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)

export async function initComments(opts = {}) {
  const root = document.getElementById('comments-root')
  if (!root) {
    console.error("The element does not exist.")
    return
  }

  const pageId = opts.pageId || CONFIG.pageId || location.pathname

  root.innerHTML = `
    <div class="comments-card">
      <div id="composer" style="margin-top:12px">
        <div class="comments-row" style="margin-bottom:8px">
          <input id="author_name" class="name-input" placeholder="Name (optional)" />
        </div>
        <textarea id="comment_body" class="comment-input" placeholder="Write a comment..."></textarea>
        <div class="comments-row" style="justify-content:space-between; margin-top:8px">
          <div class="count-badge">This thread is for <code>${escapeHtml(pageId)}</code></div>
          <div>
            <button id="post-btn" class="primary">Post</button>
          </div>
        </div>
      </div>
    </div>

    <div class="comments-card">
      <div class="comments-row" style="justify-content:space-between">
        <strong>Comments</strong>
        <span id="total-count" class="count-badge"></span>
      </div>
      <div id="list"></div>
    </div>
  `

  // === AUTH UI =====================================================


  async function updateAuthUI() {
    const result = await supabase.auth.getUser()
    const user = result && result.data ? result.data.user : null

    let label = ""
    if (user) {
      const meta = user.user_metadata || {}
      const name = user.email || meta.user_name || "User"
      label = "Signed in as " + name
    }

    userLabel.textContent = label
    loginBtn.style.display = user ? "none" : "inline-block"
    logoutBtn.style.display = user ? "inline-block" : "none"
  }



  // === LOAD COMMENTS ===============================================
  async function loadComments() {
    const res = await supabase
      .from('comments')
      .select('id, body, created_at, author_name, author_id')
      .eq('page_id', pageId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })

    if (res.error) {
      console.error(res.error)
      return
    }

    renderComments(res.data || [])
  }

  function renderComments(list) {
    const container = document.getElementById('list')
    container.innerHTML = ""
    document.getElementById('total-count').textContent = list.length + " total"

    for (let c of list) {
      const el = document.createElement('div')
      el.className = "comment-item"

      const when = new Date(c.created_at).toLocaleString()

      el.innerHTML = `
        <div class="comment-meta">${escapeHtml(c.author_name || "User")} • ${when}</div>
        <div class="comment-body">${escapeHtml(c.body)}</div>
        <div class="comments-row comments-actions" style="margin-top:6px">
          <button class="like" data-id="${c.id}">👍 Like</button>
          <button class="dislike" data-id="${c.id}">👎 Dislike</button>
          <span id="score-${c.id}" class="count-badge"></span>
        </div>
      `

      container.appendChild(el)
    }

    refreshScores(list.map(x => x.id))
  }

  // === POST COMMENT ===============================================
  document.getElementById('post-btn').addEventListener('click', async () => {
    const body = document.getElementById('comment_body').value.trim()
    const authorName = document.getElementById('author_name').value.trim() || null

    if (!body) {
      alert("Please write something")
      return
    }

    const resUser = await supabase.auth.getUser()
    const user = resUser && resUser.data ? resUser.data.user : null

    if (CONFIG.mode === 'auth-only') {
      if (CONFIG.requireLoginToComment && !user) {
        return alert("Please sign in to comment")
      }

      const insert = {
        page_id: pageId,
        body: body,
        author_name: user ? null : (authorName || "Guest"),
        author_id: user ? user.id : null
      }

      const result = await supabase.from('comments').insert(insert)
      if (result.error) return alert(result.error.message)

    } else {
      // edge-anon mode
      const fp = getFingerprint()
      const result = await supabase.functions.invoke('comment', {
        body: {
          page_id: pageId,
          body: body,
          author_name: authorName,
          fingerprint: fp
        }
      })

      if (result.error) return alert(result.error.message)
    }

    document.getElementById('comment_body').value = ""
    loadComments()
  })

  // === VOTE HANDLING ==============================================
  document.getElementById('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button')
    if (!btn) return

    const id = Number(btn.dataset.id)
    if (btn.classList.contains("like")) vote(id, 1)
    if (btn.classList.contains("dislike")) vote(id, -1)
  })

  async function vote(commentId, value) {
    const resUser = await supabase.auth.getUser()
    const user = resUser && resUser.data ? resUser.data.user : null

    if (CONFIG.mode === 'auth-only') {
      if (CONFIG.requireLoginToVote && !user) {
        return alert("Please sign in to vote")
      }

      const voterId = user ? user.id : null

      const res = await supabase
        .from('comment_votes')
        .upsert(
          { comment_id: commentId, voter_id: voterId, value: value },
          { onConflict: 'comment_id,voter_id' }
        )

      if (res.error) return alert(res.error.message)

    } else {
      const fp = getFingerprint()
      const result = await supabase.functions.invoke('vote', {
        body: {
          comment_id: commentId,
          value: value,
          fingerprint: fp
        }
      })

      if (result.error) return alert(result.error.message)
    }

    refreshScores([commentId])
  }

  // === SCORE AGGREGATION ==========================================
  async function refreshScores(ids) {
    if (!ids.length) return

    const res = await supabase
      .from('comment_votes')
      .select('comment_id, value')
      .in('comment_id', ids)

    if (res.error) {
      console.error(res.error)
      return
    }

    const map = {}
    for (let row of (res.data || [])) {
      if (!map[row.comment_id]) map[row.comment_id] = { likes: 0, dislikes: 0 }
      if (row.value === 1) map[row.comment_id].likes++
      if (row.value === -1) map[row.comment_id].dislikes++
    }

    for (let id of ids) {
      const s = map[id] || { likes: 0, dislikes: 0 }
      const el = document.getElementById("score-" + id)
      if (el) el.textContent = " " + s.likes + " / " + s.dislikes
    }
  }

  // === REALTIME ===================================================
  supabase
    .channel("comments-" + pageId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "comments", filter: "page_id=eq." + pageId },
      () => loadComments()
    )
    .subscribe()

  loadComments()
}

// === Utilities ======================================================
function getFingerprint() {
  const key = "comments_fingerprint"
  let fp = localStorage.getItem(key)
  if (!fp) {
    fp = cryptoRandom()
    localStorage.setItem(key, fp)
  }
  return fp
}

function cryptoRandom() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a).map(x => x.toString(16).padStart(2, "0")).join("")
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>\"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[m]
  })
}

// Auto‑init
if (document.getElementById('comments-root')) {
  initComments().catch(console.error)
}