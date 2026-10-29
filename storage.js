/* ================================================================
   storage.js — Storage Account Clone Manager (Kho Acc Clone)
   Cách dùng: đặt cạnh index.html, thêm 1 dòng cuối <body>:
     <script type="module" src="storage.js"></script>
   - Có firebase-config.js hợp lệ  -> lưu cloud theo tài khoản đăng nhập
   - Không có                      -> lưu trên trình duyệt (localStorage)
   ================================================================ */
(async () => {
  const CFG = window.FIREBASE_CONFIG || {};
  const WANT_CLOUD = !!(CFG.apiKey && CFG.projectId);
  const FB_VER = '10.12.2'; // phải trùng với index.html để dùng chung 1 app Firebase

  /* ---------- tiện ích ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const k in props) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) el.append(c);
    return el;
  }
  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function copy(text, okMsg) {
    const done = () => toast(okMsg || 'Đã copy');
    const fallback = () => {
      const ta = h('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Không copy được'); }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ================================================================
     CSS (kho acc + sửa lệch giao diện điện thoại)
     ================================================================ */
  const css = `
/* ----- Kho Acc Clone ----- */
#view-storage{min-width:0;animation:fadeup .4s ease both}
.stool{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.stool .vname{flex:1 1 220px;max-width:340px;border-radius:99px;padding:7px 16px;font-size:14px}
.stool .vsearch{flex:1 1 220px;max-width:420px;border-radius:99px;padding:7px 16px;font-size:14px}
.vsum{font:12px var(--mono);color:var(--muted);margin-left:auto}
.vaults{display:grid;gap:16px;min-width:0}
.vault{background:var(--glass);border:1px solid var(--line);border-radius:22px;overflow:hidden;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);min-width:0}
.vault>header{display:flex;align-items:center;gap:6px;padding:10px 14px 10px 18px}
.vtoggle{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:0;text-align:left;padding:6px 0;font-weight:600;font-size:16px}
.vtoggle .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.vtoggle small{font:12px var(--mono);color:var(--muted);font-weight:400;white-space:nowrap}
.vtoggle .car{color:var(--muted);font-size:13px;transition:transform .15s;flex:none}
.vault.open .car{transform:rotate(90deg)}
.vbody{border-top:1px solid var(--line-soft);padding:14px 16px 16px;display:grid;gap:12px;min-width:0}
.vadd{display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:8px}
.vadd .inp,.vbulk .inp{padding:8px 12px;font-size:14px;border-radius:12px;min-width:0}
.vadd .btn{width:auto;padding:8px 18px;border-radius:12px;white-space:nowrap}
.vbulk summary{cursor:pointer;color:var(--muted);font-size:13px;padding:2px 0}
.vbulk textarea{margin-top:8px;font:12.5px/1.6 var(--mono);min-height:110px}
.vbulk .vrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.vbulk .vrow .inp{flex:1 1 220px}
.vhint{font-size:12.5px;color:var(--faint);margin-top:6px}
.vact{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.alist{display:grid;border:1px solid var(--line-soft);border-radius:14px;overflow:hidden;min-width:0}
.arow{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1.5fr) auto;gap:8px 12px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--line-soft)}
.arow:last-child{border-bottom:0}
.arow:hover{background:#112038}
.acell{display:flex;align-items:center;gap:6px;min-width:0;font:13px var(--mono)}
.acell .k{color:var(--muted);font-size:11px;width:18px;flex:none}
.acell .v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.acell button{flex:none;background:none;border:0;color:var(--muted);font:11px var(--mono);padding:1px 7px;border-radius:99px;transition:color .15s,background .15s}
.acell button:hover{color:var(--accent);background:var(--raise)}
.arow .note{padding:6px 10px;font-size:13px;border-radius:10px;width:100%}
.vempty{padding:18px;text-align:center;color:var(--muted);font-size:14px}
@media (max-width:700px){
  .stool .vname,.stool .vsearch{max-width:none;flex:1 1 100%}
  .vsum{margin-left:0;width:100%}
  .vadd{grid-template-columns:1fr 1fr}
  .vadd .note,.vadd .btn{grid-column:1/-1}
  .vadd .btn{width:100%}
  .vault>header{padding-left:14px}
  .vbody{padding:12px}
  .arow{grid-template-columns:minmax(0,1fr) auto}
  .arow .c-u{grid-column:1;grid-row:1}
  .arow .c-x{grid-column:2;grid-row:1}
  .arow .c-p,.arow .c-n{grid-column:1/-1}
}

/* ----- Sửa lệch trên điện thoại: thanh tab + Clone Tab Manager + Status CloudPhone ----- */
@media (max-width:700px){
  .tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;min-width:0}
  .tabs::-webkit-scrollbar{display:none}
  .tab{flex:0 0 auto;padding:0 14px;white-space:nowrap;font-size:14px}
  #view-clones,#view-phones{min-width:0}
  .clones,.phones{min-width:0}
  .cphone,.phone{max-width:100%}
  .cphone>header{flex-wrap:wrap;padding:12px 14px;gap:8px}
  .cphone h3{flex:1 1 100%;min-width:0;overflow-wrap:anywhere}
  .cphone h3 small{display:block;margin:2px 0 0}
  .ctabs{padding:10px;gap:8px}
  .ctab{padding:8px}
  .chip2{font-size:11.5px}
  .phone>header{padding:12px 14px}
}
`;
  document.head.append(h('style', { text: css }));

  /* ================================================================
     LƯU TRÊN MÁY (localStorage)
     ================================================================ */
  function localStore() {
    let vaults = load('bfm_vaults_v1', []);
    let accs = load('bfm_vault_accs_v1', []);
    const cb = {};
    const emit = () => cb.data && cb.data(vaults.slice(), accs.slice());
    const persist = () => { save('bfm_vaults_v1', vaults); save('bfm_vault_accs_v1', accs); emit(); };
    return {
      mode: 'local',
      onData(f) { cb.data = f; },
      start() { emit(); },
      addVault(name) { const id = uid(); vaults.push({ id, name, at: Date.now() }); persist(); return id; },
      renameVault(id, name) { const v = vaults.find(x => x.id === id); if (v) { v.name = name; persist(); } },
      removeVault(id) { vaults = vaults.filter(v => v.id !== id); accs = accs.filter(a => a.vault !== id); persist(); },
      addAccs(vid, items) {
        const t = Date.now();
        items.forEach((it, i) => accs.push({ id: uid(), vault: vid, user: it.user, pass: it.pass, note: it.note, at: t + i }));
        persist();
      },
      updateAcc(id, patch) { const a = accs.find(x => x.id === id); if (a) { Object.assign(a, patch); persist(); } },
      removeAcc(id) { accs = accs.filter(a => a.id !== id); persist(); }
    };
  }

  /* ================================================================
     CLOUD (dùng chung app Firebase của index.html)
     users/{uid}/vaults/{id}      : { name, at }
     users/{uid}/vaultAccs/{id}   : { vault, user, pass, note, at }
     ================================================================ */
  async function cloudStore() {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [appM, A, F] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js')
    ]);
    let app = null;
    for (let i = 0; i < 100 && !app; i++) {
      try { app = appM.getApp(); } catch (e) { await new Promise(r => setTimeout(r, 200)); }
    }
    if (!app) throw new Error('Firebase app chưa sẵn sàng');
    const auth = A.getAuth(app);
    const db = F.getFirestore(app);
    const cb = {};
    let ctx = null, vaults = [], accs = [];
    const unsubs = [];
    const emit = () => cb.data && cb.data(vaults.slice(), accs.slice());
    const fail = e => toast('Không lưu được: ' + (e.code || e.message));
    const onErr = e => toast(e.code === 'permission-denied' ? 'Chưa cấp quyền Firestore cho kho acc (xem hướng dẫn rules)' : 'Lỗi đồng bộ: ' + (e.code || e.message));
    return {
      mode: 'cloud',
      onData(f) { cb.data = f; },
      start() {
        A.onAuthStateChanged(auth, user => {
          unsubs.splice(0).forEach(u => u());
          ctx = null; vaults = []; accs = []; emit();
          if (!user) return;
          ctx = { vcol: F.collection(db, 'users', user.uid, 'vaults'), acol: F.collection(db, 'users', user.uid, 'vaultAccs') };
          unsubs.push(F.onSnapshot(ctx.vcol, s => { vaults = s.docs.map(d => ({ ...d.data(), id: d.id })); emit(); }, onErr));
          unsubs.push(F.onSnapshot(ctx.acol, s => { accs = s.docs.map(d => ({ ...d.data(), id: d.id })); emit(); }, onErr));
        });
      },
      addVault(name) {
        if (!ctx) return null;
        const ref = F.doc(ctx.vcol);
        F.setDoc(ref, { name, at: Date.now() }).catch(fail);
        return ref.id;
      },
      renameVault(id, name) { if (ctx) F.updateDoc(F.doc(ctx.vcol, id), { name }).catch(fail); },
      async removeVault(id) {
        if (!ctx) return;
        try {
          const ids = accs.filter(a => a.vault === id).map(a => a.id);
          for (let i = 0; i < ids.length; i += 400) {
            const b = F.writeBatch(db);
            ids.slice(i, i + 400).forEach(x => b.delete(F.doc(ctx.acol, x)));
            await b.commit();
          }
          await F.deleteDoc(F.doc(ctx.vcol, id));
        } catch (e) { fail(e); }
      },
      async addAccs(vid, items) {
        if (!ctx) return;
        try {
          const t = Date.now();
          for (let i = 0; i < items.length; i += 400) {
            const b = F.writeBatch(db);
            items.slice(i, i + 400).forEach((it, j) => b.set(F.doc(ctx.acol), { vault: vid, user: it.user, pass: it.pass, note: it.note, at: t + i + j }));
            await b.commit();
          }
        } catch (e) { fail(e); }
      },
      updateAcc(id, patch) { if (ctx) F.updateDoc(F.doc(ctx.acol, id), patch).catch(fail); },
      removeAcc(id) { if (ctx) F.deleteDoc(F.doc(ctx.acol, id)).catch(fail); }
    };
  }

  /* ================================================================
     GIAO DIỆN
     ================================================================ */
  let store = null, vaults = [], accs = [], q = '';
  const open = new Set();
  const cards = new Map();

  const tabsBar = $('.tabs'), mainEl = $('main.wrap');
  if (!tabsBar || !mainEl) return;

  /* ----- tab + section ----- */
  const tabBtn = h('button', { class: 'tab', role: 'tab', id: 'tab-storage', type: 'button', 'aria-selected': 'false', text: 'Kho Acc Clone' });
  tabsBar.append(tabBtn);
  const view = h('section', { id: 'view-storage', hidden: '' });
  mainEl.append(view);

  const OTHERS = ['orders', 'scripts', 'phones', 'clones'];
  function showMine() {
    OTHERS.forEach(n => {
      const s = $('#view-' + n); if (s) s.hidden = true;
      const t = $('#tab-' + n); if (t) t.setAttribute('aria-selected', 'false');
    });
    view.hidden = false;
    tabBtn.setAttribute('aria-selected', 'true');
    try { history.replaceState(null, '', '#storage'); } catch (e) {}
    try { tabBtn.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {}
  }
  tabBtn.addEventListener('click', showMine);
  document.querySelectorAll('.tab').forEach(b => {
    if (b !== tabBtn) b.addEventListener('click', () => { view.hidden = true; tabBtn.setAttribute('aria-selected', 'false'); });
  });

  /* ----- thanh công cụ ----- */
  const nameInp = h('input', { class: 'inp vname', placeholder: 'Tên kho clone mới…', maxlength: '60', autocomplete: 'off', 'aria-label': 'Tên kho clone' });
  const createBtn = h('button', { class: 'ghost solid', type: 'button', text: '+ Tạo kho clone', onclick: createVault });
  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); createVault(); } });
  const searchInp = h('input', { class: 'inp vsearch', type: 'search', placeholder: 'Tìm acc hoặc ghi chú ở mọi kho…', 'aria-label': 'Tìm acc' });
  searchInp.addEventListener('input', () => { q = searchInp.value; render(); });
  const sum = h('span', { class: 'vsum' });
  const box = h('div', { class: 'vaults' });
  const emptyBox = h('div', { class: 'empty', hidden: '' }, h('b', { text: 'Chưa có kho clone nào' }),
    h('span', { text: 'Gõ tên kho rồi bấm "+ Tạo kho clone". Mỗi kho chứa được nhiều acc, mỗi acc có ghi chú riêng.' }));
  view.append(h('h2', { text: 'Storage Account Clone Manager' }),
    h('div', { class: 'stool' }, nameInp, createBtn, searchInp, sum), box, emptyBox);

  function createVault() {
    const n = nameInp.value.trim();
    if (!n) { toast('Nhập tên kho trước'); nameInp.focus(); return; }
    const id = store && store.addVault(n);
    if (!id) { toast('Chưa đăng nhập hoặc chưa sẵn sàng'); return; }
    open.add(id); nameInp.value = ''; render();
  }

  /* ----- parse nhiều acc: user:pass hoặc user:pass | ghi chú ----- */
  function parseBulk(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      let note = '';
      const i = line.indexOf('|');
      if (i >= 0) { note = line.slice(i + 1).trim(); line = line.slice(0, i).trim(); }
      let user = line, pass = '';
      const j = line.indexOf(':');
      if (j >= 0) { user = line.slice(0, j).trim(); pass = line.slice(j + 1).trim(); }
      else { const p = line.split(/\s+/); user = p[0]; pass = p.slice(1).join(' '); }
      return { user, pass, note };
    }).filter(x => x.user);
  }

  function addItems(card, items) {
    const have = new Set((card.data || []).map(a => (a.user || '').toLowerCase()));
    const fresh = []; let dup = 0;
    items.forEach(it => {
      const k = it.user.toLowerCase();
      if (have.has(k)) { dup++; return; }
      have.add(k); fresh.push(it);
    });
    if (fresh.length) store.addAccs(card.v.id, fresh);
    toast(fresh.length ? ('Đã thêm ' + fresh.length + ' acc' + (dup ? ', bỏ qua ' + dup + ' trùng' : '')) : (dup ? 'Acc đã có trong kho này' : 'Không có gì để thêm'));
    return { added: fresh.length, dup };
  }

  /* ----- một dòng acc ----- */
  function accRow(a) {
    const ucell = h('div', { class: 'acell c-u' }, h('span', { class: 'k', text: 'TK' }),
      h('span', { class: 'v', title: a.user || '', text: a.user || '' }),
      h('button', { type: 'button', text: 'copy', onclick() { copy(a.user || '', 'Đã copy tài khoản'); } }));
    const pv = h('span', { class: 'v', text: a.pass ? '••••••••' : '—' });
    const pcell = h('div', { class: 'acell c-p' }, h('span', { class: 'k', text: 'MK' }), pv);
    if (a.pass) {
      let vis = false;
      pcell.append(
        h('button', { type: 'button', text: 'hiện', onclick(ev) { vis = !vis; pv.textContent = vis ? a.pass : '••••••••'; ev.target.textContent = vis ? 'ẩn' : 'hiện'; } }),
        h('button', { type: 'button', text: 'copy', onclick() { copy(a.pass, 'Đã copy mật khẩu'); } }));
    }
    const note = h('input', { class: 'inp note', placeholder: 'Ghi chú…', maxlength: '300', 'aria-label': 'Ghi chú', value: a.note || '' });
    note.addEventListener('change', () => store.updateAcc(a.id, { note: note.value.trim() }));
    const x = h('button', { class: 'del', type: 'button', title: 'Xóa acc', 'aria-label': 'Xóa acc', text: '×',
      onclick() { if (confirm('Xóa acc ' + (a.user || '') + '?')) store.removeAcc(a.id); } });
    return h('div', { class: 'arow' }, ucell, pcell, h('div', { class: 'c-n' }, note), h('div', { class: 'c-x' }, x));
  }

  function fillList(card) {
    const ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT' && card.list.contains(ae)) { card.dirty = true; return; }
    card.dirty = false;
    card.list.textContent = '';
    if (!card.items.length) {
      card.list.append(h('div', { class: 'vempty', text: q.trim() ? 'Không có acc khớp' : 'Kho trống — thêm acc ở khung phía trên.' }));
    } else {
      const frag = document.createDocumentFragment();
      card.items.slice(0, card.limit).forEach(a => frag.append(accRow(a)));
      card.list.append(frag);
    }
    const rest = card.items.length - card.limit;
    card.more.hidden = rest <= 0;
    card.more.textContent = 'Xem thêm (' + rest + ')';
  }

  /* ----- một kho ----- */
  function makeCard(v) {
    const card = { v, data: [], items: [], limit: 100, dirty: false };
    const nm = h('span', { class: 'nm' });
    const count = h('small');
    const toggle = h('button', { class: 'vtoggle', type: 'button', 'aria-expanded': 'false',
      onclick() { if (open.has(card.v.id)) open.delete(card.v.id); else open.add(card.v.id); render(); } },
      h('span', { class: 'car', text: '▸' }), nm, count);
    const ren = h('button', { class: 'del', type: 'button', title: 'Đổi tên kho', 'aria-label': 'Đổi tên kho', text: '✎',
      onclick() { const n = prompt('Tên mới cho kho:', card.v.name || ''); if (n && n.trim()) store.renameVault(card.v.id, n.trim()); } });
    const del = h('button', { class: 'del', type: 'button', title: 'Xóa kho', 'aria-label': 'Xóa kho', text: '×',
      onclick() {
        if (confirm('Xóa kho "' + (card.v.name || '') + '" cùng ' + card.data.length + ' acc bên trong?')) { open.delete(card.v.id); store.removeVault(card.v.id); }
      } });

    const fu = h('input', { class: 'inp', placeholder: 'Tài khoản *', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Tài khoản' });
    const fp = h('input', { class: 'inp', placeholder: 'Mật khẩu', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Mật khẩu' });
    const fn = h('input', { class: 'inp note', placeholder: 'Ghi chú (vd: lv 2550, đã có Dough…)', maxlength: '300', autocomplete: 'off', 'aria-label': 'Ghi chú' });
    const form = h('form', { class: 'vadd', autocomplete: 'off',
      onsubmit(ev) {
        ev.preventDefault();
        const user = fu.value.trim();
        if (!user) { fu.focus(); return; }
        const r = addItems(card, [{ user, pass: fp.value.trim(), note: fn.value.trim() }]);
        if (r.added) { fu.value = ''; fp.value = ''; fn.value = ''; fu.focus(); }
      } }, fu, fp, fn, h('button', { class: 'btn', type: 'submit', text: '+ Thêm acc' }));

    const bt = h('textarea', { class: 'inp', spellcheck: 'false', placeholder: 'user1:pass1 | ghi chú\nuser2:pass2\nuser3:pass3 | acc dự phòng' });
    const bn = h('input', { class: 'inp', placeholder: 'Ghi chú chung cho cả loạt (không bắt buộc)', maxlength: '300' });
    const bulk = h('details', { class: 'vbulk' }, h('summary', { text: 'Thêm nhiều acc cùng lúc' }), bt,
      h('div', { class: 'vrow' }, bn, h('button', { class: 'ghost solid', type: 'button', text: 'Thêm tất cả',
        onclick() {
          const items = parseBulk(bt.value);
          if (!items.length) { toast('Chưa có dòng nào hợp lệ'); return; }
          const g = bn.value.trim();
          items.forEach(i => { if (!i.note) i.note = g; });
          const r = addItems(card, items);
          if (r.added) bt.value = '';
        } })),
      h('div', { class: 'vhint', text: 'Mỗi dòng một acc: user:pass hoặc user:pass | ghi chú. Acc trùng tên trong kho sẽ bị bỏ qua.' }));

    const act = h('div', { class: 'vact' }, h('button', { class: 'ghost', type: 'button', text: 'Copy tất cả (user:pass)',
      onclick() {
        if (!card.items.length) { toast('Kho trống'); return; }
        copy(card.items.map(a => (a.user || '') + ':' + (a.pass || '') + (a.note ? ' | ' + a.note : '')).join('\n'), 'Đã copy ' + card.items.length + ' acc');
      } }));

    const list = h('div', { class: 'alist' });
    const more = h('button', { class: 'ghost more', type: 'button', hidden: '', onclick() { card.limit += 100; fillList(card); } });
    list.addEventListener('focusout', () => { if (card.dirty) setTimeout(() => fillList(card), 0); });
    const body = h('div', { class: 'vbody', hidden: '' }, form, bulk, act, list, more);
    const el = h('section', { class: 'vault' }, h('header', {}, toggle, ren, del), body);
    Object.assign(card, { el, nm, count, toggle, body, list, more });
    return card;
  }

  /* ----- vẽ lại ----- */
  function render() {
    const ql = q.trim().toLowerCase();
    const group = new Map();
    accs.forEach(a => { if (!group.has(a.vault)) group.set(a.vault, []); group.get(a.vault).push(a); });
    group.forEach(l => l.sort((a, b) => (b.at || 0) - (a.at || 0)));
    const vs = vaults.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const keep = new Set();
    let idx = 0, visibleCount = 0;

    vs.forEach(v => {
      keep.add(v.id);
      let card = cards.get(v.id);
      if (!card) { card = makeCard(v); cards.set(v.id, card); }
      card.v = v;
      card.data = group.get(v.id) || [];
      const hit = a => (a.user || '').toLowerCase().includes(ql) || (a.note || '').toLowerCase().includes(ql);
      const hits = ql ? card.data.filter(hit) : card.data;
      const nameHit = !!ql && (v.name || '').toLowerCase().includes(ql);
      card.items = ql ? (hits.length ? hits : (nameHit ? card.data : [])) : card.data;
      const visible = !ql || hits.length > 0 || nameHit;
      card.el.hidden = !visible;
      if (visible) visibleCount++;
      const isOpen = open.has(v.id) || (!!ql && hits.length > 0);
      card.el.classList.toggle('open', isOpen);
      card.body.hidden = !isOpen;
      card.toggle.setAttribute('aria-expanded', String(isOpen));
      card.nm.textContent = v.name || '(không tên)';
      card.count.textContent = (ql && hits.length !== card.data.length ? hits.length + '/' : '') + card.data.length + ' acc';
      if (isOpen) fillList(card);
      if (box.children[idx] !== card.el) box.insertBefore(card.el, box.children[idx] || null);
      idx++;
    });
    cards.forEach((card, id) => { if (!keep.has(id)) { card.el.remove(); cards.delete(id); } });

    sum.textContent = vaults.length + ' kho · ' + accs.length + ' acc';
    emptyBox.hidden = vaults.length > 0 && visibleCount > 0;
    if (vaults.length > 0 && visibleCount === 0) {
      emptyBox.firstChild.textContent = 'Không tìm thấy';
      emptyBox.lastChild.textContent = 'Thử từ khóa khác.';
      emptyBox.hidden = false;
    } else if (!vaults.length) {
      emptyBox.firstChild.textContent = 'Chưa có kho clone nào';
      emptyBox.lastChild.textContent = 'Gõ tên kho rồi bấm "+ Tạo kho clone". Mỗi kho chứa được nhiều acc, mỗi acc có ghi chú riêng.';
    }
  }

  /* ----- khởi động ----- */
  if (WANT_CLOUD) {
    try { store = await cloudStore(); }
    catch (e) { console.warn('storage.js:', e); store = localStore(); toast('Không nối được Firebase, kho acc đang lưu tạm trên máy này'); }
  } else store = localStore();
  store.onData((v, a) => { vaults = v; accs = a; render(); });
  store.start();
  render();
  if (location.hash === '#storage') showMine();
})();
