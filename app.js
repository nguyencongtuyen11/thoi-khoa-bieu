// =====================================================================
//  app.js — Thời khóa biểu Giáo viên (Supabase)
// =====================================================================
(function () {
  "use strict";

  let sb = null;
  let user = null;          // auth user
  let currentUid = null;    // chống chạy afterLogin 2 lần
  let myProfile = null;     // { id, full_name, role }
  let profilesById = {};
  let allForWeek = [];      // lịch của tuần đang xem
  let viewDate = startOfToday();
  let recovering = false;   // đang trong luồng đặt lại mật khẩu (mở từ link email)
  let resetDone = false;    // vừa đổi mật khẩu xong -> báo & quay lại đăng nhập

  const BUOI = [
    { key: "sang",  label: "Sáng",      icon: "☀️", start: "08:00", end: "09:30" },
    { key: "chieu", label: "Chiều",     icon: "🌤️", start: "14:00", end: "15:30" },
    { key: "toi",   label: "Tối",       icon: "🌙", start: "18:30", end: "20:00" },
  ];
  const DOW = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const DOW_SHORT = { 0: "CN", 1: "Th 2", 2: "Th 3", 3: "Th 4", 4: "Th 5", 5: "Th 6", 6: "Th 7" };

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  // ---------- tiện ích ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; } // Thứ 2 đầu tuần
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function ymd(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${dd}`; }
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function dmy(d) { return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
  function hhmm(t) { return t ? String(t).slice(0, 5) : ""; }
  function ymdToDmy(s) { if (!s) return ""; const p = String(s).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ""; }
  function dmyToYmd(s) {
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function normTime(s) {
    const m = String(s).trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  function buoiOf(t) { const h = parseInt(String(t).slice(0, 2), 10); return h < 12 ? "sang" : h < 18 ? "chieu" : "toi"; }
  function initials(name) { const p = String(name || "?").trim().split(/\s+/); return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase(); }

  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    $("toastWrap").appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 2600);
  }

  // ---------- THEME ----------
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("themeBtn").innerHTML = t === "dark" ? MOON : SUN;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0a0e1a" : "#f6f9fc");
    try { localStorage.setItem("tkb-theme", t); } catch (e) {}
  }
  function initTheme() {
    let t = "dark";
    try { t = localStorage.getItem("tkb-theme") || "dark"; } catch (e) {}
    applyTheme(t);
    $("themeBtn").addEventListener("click", () => {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }

  // ---------- KHỞI TẠO ----------
  function configReady() {
    const c = window.APP_CONFIG || {};
    return c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !c.SUPABASE_URL.startsWith("DAN_") && !c.SUPABASE_ANON_KEY.startsWith("DAN_");
  }

  async function init() {
    initTheme();
    wireEvents();

    if (!configReady()) {
      $("configBanner").classList.remove("hidden");
      authErr("Vui lòng cấu hình Supabase trong file config.js trước khi sử dụng.");
      $("authPrimary").disabled = true;
      return;
    }

    // Mở từ link đặt lại mật khẩu? (URL có #...type=recovery)
    recovering = /type=recovery/.test(location.hash);

    sb = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);

    if (recovering) { showAuth(); setAuthMode("reset"); }

    const { data } = await sb.auth.getSession();
    if (data.session && data.session.user && !recovering) { user = data.session.user; await afterLogin(); }

    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { recovering = true; showAuth(); setAuthMode("reset"); return; }
      if (recovering) return; // đang đặt lại mật khẩu -> chưa vào app dù đã có phiên tạm
      if (session && session.user) { user = session.user; afterLogin(); }
      else { onSignedOut(); }
    });
  }

  // =====================================================================
  //  AUTH (đăng nhập / đăng ký / quên / đặt lại) — học theo project thu-chi
  // =====================================================================
  let authMode = "login";
  const AUTH_LABEL = { login: "Đăng nhập", signup: "Đăng ký", forgot: "Gửi liên kết đặt lại", reset: "Đổi mật khẩu" };

  function showAuth() { $("authOverlay").hidden = false; }
  function hideAuth() { $("authOverlay").hidden = true; }
  function authErr(msg, ok) { const e = $("authErr"); e.textContent = msg || ""; e.style.color = ok ? "var(--good)" : "var(--bad)"; }
  function authBusy(on, txt) { const b = $("authPrimary"); b.disabled = on; b.textContent = on ? txt : AUTH_LABEL[authMode]; }

  function setAuthMode(m) {
    authMode = m; authErr("");
    const meta = {
      login:  ["Đăng nhập", "Đăng nhập để quản lý thời khóa biểu của cả đội"],
      signup: ["Tạo tài khoản", "Tạo tài khoản giáo viên mới bằng email"],
      forgot: ["Quên mật khẩu", "Nhập email — chúng tôi sẽ gửi liên kết đặt lại mật khẩu"],
      reset:  ["Đặt mật khẩu mới", "Nhập mật khẩu mới cho tài khoản của bạn"],
    }[m] || ["Đăng nhập", ""];
    $("authTitle").textContent = meta[0];
    $("authSub").textContent = meta[1];
    $("authPrimary").textContent = AUTH_LABEL[m];
    $("fName").hidden  = (m !== "signup");
    $("fEmail").hidden = (m === "reset");
    $("fPass").hidden  = (m !== "login" && m !== "signup");
    $("fNew").hidden   = (m !== "reset");
    $("fNew2").hidden  = (m !== "reset");
    $("lnkForgot").hidden = (m !== "login");
    $("lnkSignup").hidden = (m !== "login");
    $("lnkBack").hidden   = (m === "login" || m === "reset");
  }

  function friendlyAuthErr(msg) {
    if (/invalid|credentials/i.test(msg)) return "Sai email hoặc mật khẩu.";
    if (/already registered/i.test(msg)) return "Email này đã được đăng ký.";
    if (/not confirmed/i.test(msg)) return "Email chưa xác nhận. Kiểm tra hộp thư.";
    if (/should be at least/i.test(msg)) return "Mật khẩu cần tối thiểu 6 ký tự.";
    return msg;
  }

  async function doLogin() {
    const email = $("authEmail").value.trim(), password = $("authPass").value;
    if (!email || !password) return authErr("Nhập email và mật khẩu.");
    authBusy(true, "Đang đăng nhập...");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    authBusy(false);
    if (error) authErr(friendlyAuthErr(error.message));
    else if (data.session) { user = data.session.user; await afterLogin(); }
  }
  async function doSignup() {
    const name = $("authName").value.trim(), email = $("authEmail").value.trim(), password = $("authPass").value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { authErr("Email chưa đúng định dạng."); $("authEmail").focus(); return; }
    if (password.length < 6) { authErr("Mật khẩu cần tối thiểu 6 ký tự."); $("authPass").focus(); return; }
    authBusy(true, "Đang tạo...");
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name || email.split("@")[0] }, emailRedirectTo: location.origin } });
    authBusy(false);
    if (error) return authErr(friendlyAuthErr(error.message));
    if (data.session) { user = data.session.user; await afterLogin(); }
    else authErr("✅ Đã tạo tài khoản! Kiểm tra email để xác nhận rồi đăng nhập.", true);
  }
  async function doForgot() {
    const email = $("authEmail").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { authErr("Nhập email hợp lệ để nhận liên kết."); $("authEmail").focus(); return; }
    authBusy(true, "Đang gửi...");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    authBusy(false);
    if (error) authErr(error.message);
    else authErr("✅ Đã gửi email! Mở email và bấm liên kết để đặt mật khẩu mới (xem cả Spam/Quảng cáo).", true);
  }
  async function doReset() {
    const p1 = $("authNew").value, p2 = $("authNew2").value;
    if (p1.length < 6) { authErr("Mật khẩu mới cần tối thiểu 6 ký tự."); $("authNew").focus(); return; }
    if (p1 !== p2) { authErr("Hai mật khẩu không khớp."); $("authNew2").focus(); return; }
    authBusy(true, "Đang đổi...");
    const { error } = await sb.auth.updateUser({ password: p1 });
    authBusy(false);
    if (error) return authErr(/different|same/i.test(error.message) ? "Mật khẩu mới phải khác mật khẩu cũ." : error.message);
    recovering = false; resetDone = true;
    history.replaceState(null, "", location.pathname); // xóa token khỏi URL
    await sb.auth.signOut(); // đăng xuất phiên tạm -> quay lại màn đăng nhập (onSignedOut)
  }

  async function afterLogin() {
    if (currentUid === user.id) return;
    currentUid = user.id;
    myProfile = await ensureProfile(user);
    hideAuth();
    $("app").classList.remove("hidden");

    const name = (myProfile && myProfile.full_name) || user.email;
    $("accName").textContent = name;
    $("accAvatar").textContent = initials(name);
    $("accRole").innerHTML = isAdmin() ? 'Quản trị viên <span class="badge-admin">ADMIN</span>' : "Giáo viên";

    setViewDate(viewDate);
  }
  function onSignedOut() {
    user = null; currentUid = null; myProfile = null; profilesById = {}; allForWeek = [];
    $("app").classList.add("hidden");
    showAuth(); setAuthMode("login");
    $("authPass").value = "";
    if (resetDone) { resetDone = false; authErr("✅ Đổi mật khẩu thành công! Hãy đăng nhập lại bằng mật khẩu mới.", true); }
  }

  async function ensureProfile(u) {
    let { data } = await sb.from("profiles").select("id, full_name, role").eq("id", u.id).maybeSingle();
    if (!data) {
      const fullName = (u.user_metadata && u.user_metadata.full_name) || u.email.split("@")[0];
      const ins = await sb.from("profiles").insert({ id: u.id, full_name: fullName, role: "teacher" }).select("id, full_name, role").maybeSingle();
      data = ins.data;
    }
    return data || { id: u.id, full_name: u.email, role: "teacher" };
  }
  function isAdmin() { return myProfile && myProfile.role === "admin"; }
  function canManage(s) { return isAdmin() || (user && s.teacher_id === user.id); }
  function teacherDisplay(s) { return (profilesById[s.teacher_id] && profilesById[s.teacher_id].full_name) || s.teacher_name || "Giáo viên"; }

  // =====================================================================
  //  ĐIỀU HƯỚNG NGÀY
  // =====================================================================
  function setViewDate(d) {
    viewDate = new Date(d); viewDate.setHours(0, 0, 0, 0);
    const ws = startOfWeek(viewDate), we = addDays(ws, 6);
    $("navRange").textContent = `${dmy(ws)} – ${dmy(we)}`;
    $("navMonth").textContent = `Tháng ${we.getMonth() + 1}, ${we.getFullYear()}`;
    $("datePicker").value = dmy(viewDate);
    loadSchedules();
  }
  function navigate(kind, delta) {
    const d = new Date(viewDate);
    if (kind === "day") d.setDate(d.getDate() + delta);
    else if (kind === "week") d.setDate(d.getDate() + delta * 7);
    else if (kind === "month") d.setMonth(d.getMonth() + delta);
    setViewDate(d);
  }

  // =====================================================================
  //  TẢI & HIỂN THỊ
  // =====================================================================
  async function loadSchedules() {
    $("tkbWrap").classList.add("loading");
    $("loading").classList.remove("hidden");

    const { data: profs } = await sb.from("profiles").select("id, full_name, role");
    profilesById = {};
    (profs || []).forEach((p) => (profilesById[p.id] = p));
    fillTeacherFilter(profs || []);

    const ws = startOfWeek(viewDate), we = addDays(ws, 6);
    const { data, error } = await sb.from("schedules").select("*")
      .gte("schedule_date", ymd(ws))
      .lte("schedule_date", ymd(we))
      .order("start_time", { ascending: true });

    $("loading").classList.add("hidden");
    $("tkbWrap").classList.remove("loading");
    if (error) { toast("Lỗi tải lịch: " + error.message, "err"); allForWeek = []; }
    else allForWeek = data || [];
    render();
  }

  function fillTeacherFilter(profs) {
    const sel = $("teacherFilter"), cur = sel.value;
    sel.innerHTML = '<option value="all">Tất cả giáo viên</option><option value="me">Chỉ lịch của tôi</option>';
    profs.slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "vi")).forEach((p) => {
      const o = document.createElement("option"); o.value = p.id; o.textContent = p.full_name || "(không tên)"; sel.appendChild(o);
    });
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  function filtered() {
    const f = $("teacherFilter").value;
    if (f === "all") return allForWeek;
    if (f === "me") return allForWeek.filter((s) => s.teacher_id === (user && user.id));
    return allForWeek.filter((s) => s.teacher_id === f);
  }

  function render() {
    const list = filtered();
    const ws = startOfWeek(viewDate);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
    const todayY = ymd(startOfToday());

    // map: ymd -> { sang:[], chieu:[], toi:[] }
    const map = {};
    days.forEach((d) => (map[ymd(d)] = { sang: [], chieu: [], toi: [] }));
    list.forEach((s) => { const m = map[s.schedule_date]; if (m) m[buoiOf(s.start_time)].push(s); });

    renderGrid(days, map, todayY);
    renderList(days, map, todayY);
  }

  // --- Lưới tuần (laptop) ---
  function renderGrid(days, map, todayY) {
    let h = '<div class="wg-corner"></div>';
    days.forEach((d) => {
      const t = ymd(d) === todayY ? " today" : "";
      h += `<div class="wg-head${t}"><div class="wd">${DOW_SHORT[d.getDay()]}</div><div class="dt">${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}</div></div>`;
    });
    BUOI.forEach((b) => {
      h += `<div class="wg-buoi"><span class="chip ${b.key}"><span class="ic">${b.icon}</span>${b.label}</span></div>`;
      days.forEach((d) => {
        const dy = ymd(d), t = dy === todayY ? " today" : "";
        const items = map[dy][b.key];
        h += `<div class="wg-cell${t}">` +
          items.map((s) => miniCard(s, true)).join("") +
          `<button class="cell-add" data-add="${dy}|${b.key}" title="Thêm lịch ${b.label} ${DOW_SHORT[d.getDay()]}">+</button>` +
          `</div>`;
      });
    });
    $("weekGrid").innerHTML = h;
  }

  // --- Danh sách theo ngày (điện thoại) ---
  function renderList(days, map, todayY) {
    let h = "";
    days.forEach((d) => {
      const dy = ymd(d), t = dy === todayY ? " today" : "";
      const dayBuois = BUOI.filter((b) => map[dy][b.key].length);
      h += `<div class="day-block">` +
        `<div class="dhead${t}"><span class="dname">${DOW[d.getDay()]} · ${dmy(d)}</span>` +
        `<button class="dadd" data-add="${dy}|chieu">+ Thêm</button></div>` +
        `<div class="dbody">`;
      if (!dayBuois.length) {
        h += `<div class="day-empty">Chưa có lịch.</div>`;
      } else {
        dayBuois.forEach((b) => {
          h += `<div class="buoi-row"><span class="buoi-pill ${b.key}">${b.icon} ${b.label}</span>` +
            `<div class="buoi-items">` + map[dy][b.key].map((s) => miniCard(s, false)).join("") + `</div></div>`;
        });
      }
      h += `</div></div>`;
    });
    $("weekList").innerHTML = h;
  }

  // --- Thẻ một tiết học ---
  function miniCard(s, compact) {
    const name = teacherDisplay(s);
    const act = canManage(s)
      ? `<div class="acts"><button class="edit" data-edit="${s.id}" title="Sửa">${ICON_EDIT}</button>` +
        `<button class="del" data-del="${s.id}" title="Xóa">${ICON_DEL}</button></div>`
      : "";
    const meta = [
      s.class_name ? "Lớp " + esc(s.class_name) : "",
      compact ? "" : "GV: " + esc(name),
      s.room ? "📍 " + esc(s.room) : "",
    ].filter(Boolean).join(" · ");
    return `<div class="mini">` +
      `<div class="t">${hhmm(s.start_time)}–${hhmm(s.end_time)}</div>` +
      `<div class="s">${esc(s.subject)}</div>` +
      (compact ? `<div class="m">${esc(name)}${s.class_name ? " · Lớp " + esc(s.class_name) : ""}</div>` +
                 (s.room ? `<div class="m">📍 ${esc(s.room)}</div>` : "")
               : `<div class="m">${meta}</div>`) +
      (s.note ? `<div class="m">📝 ${esc(s.note)}</div>` : "") +
      act +
      `</div>`;
  }

  // =====================================================================
  //  THÊM / SỬA / XÓA
  // =====================================================================
  function openModal(schedule, presetDate, presetBuoi) {
    const isEdit = !!schedule;
    $("modalTitle").textContent = isEdit ? "Sửa lịch học" : "Thêm lịch học";
    $("formErr").classList.add("hidden");
    $("scheduleForm").reset();
    $("schedId").value = isEdit ? schedule.id : "";

    if (isEdit) {
      $("fSubject").value = schedule.subject || "";
      $("fDate").value = ymdToDmy(schedule.schedule_date);
      $("fStart").value = hhmm(schedule.start_time);
      $("fEnd").value = hhmm(schedule.end_time);
      $("fClass").value = schedule.class_name || "";
      $("fRoom").value = schedule.room || "";
      $("fNote").value = schedule.note || "";
    } else {
      $("fDate").value = ymdToDmy(presetDate || ymd(viewDate));
      const b = BUOI.find((x) => x.key === presetBuoi) || BUOI[1];
      $("fStart").value = b.start; $("fEnd").value = b.end;
    }

    // Ô chọn giáo viên phụ trách: chỉ Admin mới thấy & đổi được
    $("fOwnerWrap").hidden = !isAdmin();
    if (isAdmin()) fillOwnerSelect(isEdit ? schedule.teacher_id : (user && user.id));

    $("modal").classList.remove("hidden");
    $("fSubject").focus();
  }

  function fillOwnerSelect(selectedId) {
    const sel = $("fOwner");
    const profs = Object.values(profilesById).slice()
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "vi"));
    sel.innerHTML = "";
    profs.forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.full_name || "(không tên)"; sel.appendChild(o); });
    if (selectedId && ![...sel.options].some((o) => o.value === selectedId)) {
      const o = document.createElement("option"); o.value = selectedId; o.textContent = (myProfile && myProfile.full_name) || "Tôi"; sel.appendChild(o);
    }
    sel.value = selectedId || "";
  }
  function closeModal() { $("modal").classList.add("hidden"); }
  function formErr(msg) { const e = $("formErr"); e.textContent = msg; e.classList.remove("hidden"); }

  async function saveSchedule() {
    const id = $("schedId").value;
    const ownerId = isAdmin() ? ($("fOwner").value || user.id) : user.id;
    const ownerName = (profilesById[ownerId] && profilesById[ownerId].full_name) || null;
    const sd = dmyToYmd($("fDate").value);
    const st = normTime($("fStart").value);
    const et = normTime($("fEnd").value);
    const payload = {
      schedule_date: sd,
      subject: $("fSubject").value.trim(),
      start_time: st,
      end_time: et,
      class_name: $("fClass").value.trim() || null,
      room: $("fRoom").value.trim() || null,
      teacher_name: ownerName,
      note: $("fNote").value.trim() || null,
    };
    if (!payload.subject) return formErr("Vui lòng nhập môn học / nội dung.");
    if (!sd) return formErr("Ngày không hợp lệ — nhập theo dd/mm/yyyy (vd 17/06/2026).");
    if (!st || !et) return formErr("Giờ không hợp lệ — nhập 24h theo HH:MM (vd 14:30).");
    if (et <= st) return formErr("Giờ kết thúc phải sau giờ bắt đầu.");

    $("modalSave").disabled = true;
    try {
      let error;
      if (id) {
        if (isAdmin()) payload.teacher_id = ownerId; // Admin có thể đổi giáo viên phụ trách
        ({ error } = await sb.from("schedules").update(payload).eq("id", id));
      } else {
        payload.teacher_id = ownerId;
        ({ error } = await sb.from("schedules").insert(payload));
      }
      if (error) throw error;
      closeModal();
      toast(id ? "Đã cập nhật lịch." : "Đã thêm lịch mới.", "ok");
      setViewDate(parseYmd(payload.schedule_date)); // nhảy tới ngày vừa lưu
    } catch (err) {
      formErr("Lưu thất bại: " + (err.message || err));
    } finally {
      $("modalSave").disabled = false;
    }
  }

  async function deleteSchedule(id) {
    const s = allForWeek.find((x) => x.id === id);
    if (!s) return;
    if (!confirm(`Xóa lịch "${s.subject}" (${hhmm(s.start_time)}–${hhmm(s.end_time)})? Không thể hoàn tác.`)) return;
    const { error } = await sb.from("schedules").delete().eq("id", id);
    if (error) toast("Xóa thất bại: " + error.message, "err");
    else { toast("Đã xóa lịch.", "ok"); loadSchedules(); }
  }

  // =====================================================================
  //  SỰ KIỆN
  // =====================================================================
  // Tự chèn dấu "/" và ":" khi gõ; giữ picker lịch gốc qua input ẩn
  function maskDate(el) {
    el.addEventListener("input", () => {
      const v = el.value.replace(/\D/g, "").slice(0, 8);
      el.value = [v.slice(0, 2), v.slice(2, 4), v.slice(4, 8)].filter((x) => x.length).join("/");
    });
  }
  function maskTime(el) {
    el.addEventListener("input", () => {
      const v = el.value.replace(/\D/g, "").slice(0, 4);
      el.value = [v.slice(0, 2), v.slice(2, 4)].filter((x) => x.length).join(":");
    });
  }
  function wireCal(btn) {
    const id = btn.getAttribute("data-cal");
    const text = $(id), native = $(id + "Native");
    if (!text || !native) return;
    btn.addEventListener("click", () => {
      native.value = dmyToYmd(text.value) || ymd(startOfToday());
      try { if (native.showPicker) native.showPicker(); else native.focus(); } catch (e) { native.focus(); }
    });
    native.addEventListener("change", () => {
      if (native.value) { text.value = ymdToDmy(native.value); text.dispatchEvent(new Event("change")); }
    });
  }

  function wireEvents() {
    // Auth
    $("authPrimary").addEventListener("click", () => {
      if (authMode === "login") doLogin();
      else if (authMode === "signup") doSignup();
      else if (authMode === "forgot") doForgot();
      else if (authMode === "reset") doReset();
    });
    $("lnkForgot").addEventListener("click", () => setAuthMode("forgot"));
    $("lnkSignup").addEventListener("click", () => setAuthMode("signup"));
    $("lnkBack").addEventListener("click", () => setAuthMode("login"));
    ["authName", "authEmail", "authPass", "authNew", "authNew2"].forEach((id) =>
      $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") $("authPrimary").click(); }));
    $("logoutBtn").addEventListener("click", async () => { if (sb) await sb.auth.signOut(); });

    // Điều hướng ngày
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => { const [k, d] = btn.getAttribute("data-nav").split(":"); navigate(k, parseInt(d, 10)); });
    });
    $("datePicker").addEventListener("change", () => { const y = dmyToYmd($("datePicker").value); if (y) setViewDate(parseYmd(y)); });
    $("todayBtn").addEventListener("click", () => setViewDate(startOfToday()));
    $("teacherFilter").addEventListener("change", render);
    ["fDate", "datePicker"].forEach((id) => maskDate($(id)));
    ["fStart", "fEnd"].forEach((id) => maskTime($(id)));
    document.querySelectorAll(".cal-btn").forEach(wireCal);

    // Thêm/sửa/xóa
    $("addBtn").addEventListener("click", () => openModal(null, ymd(viewDate), buoiOf(new Date().toTimeString())));
    $("modalClose").addEventListener("click", closeModal);
    $("modalCancel").addEventListener("click", closeModal);
    $("modalSave").addEventListener("click", saveSchedule);
    $("scheduleForm").addEventListener("submit", (e) => { e.preventDefault(); saveSchedule(); });
    $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
    $("tkbWrap").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit]"), de = e.target.closest("[data-del]"), ad = e.target.closest("[data-add]");
      if (ed) { const s = allForWeek.find((x) => x.id === ed.getAttribute("data-edit")); if (s) openModal(s); }
      else if (de) deleteSchedule(de.getAttribute("data-del"));
      else if (ad) { const parts = ad.getAttribute("data-add").split("|"); openModal(null, parts[0], parts[1]); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").classList.contains("hidden")) closeModal(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
