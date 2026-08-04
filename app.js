/* =========================================================
   NBC Plant Property Removal — app.js
   Firebase Firestore + Auth + Cloudinary
   ========================================================= */

// ---------- Firebase config ----------
const firebaseConfig = {
  apiKey: "AIzaSyCHMYRJ42snU4pF-7w66QroXF9tG_4PcsE",
  authDomain: "nbc-property-removal.firebaseapp.com",
  projectId: "nbc-property-removal",
  storageBucket: "nbc-property-removal.firebasestorage.app",
  messagingSenderId: "522200636163",
  appId: "1:522200636163:web:7f787f46af7770db56e736"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- EmailJS (notification emails) ----------
// TODO: replace these 3 values after Jay signs up at emailjs.com (see setup guide in chat)
const EMAILJS_PUBLIC_KEY = "3sGt-ZuFOKnhOCi4E";
const EMAILJS_SERVICE_ID = "service_zmwbtqh";
const EMAILJS_TEMPLATE_ID = "template_ko6gf6c";

if (window.emailjs && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

function biSubject(th, en) { return th + " / " + en; }
function biMessage(th, en) { return th + "\n\n— English —\n" + en; }

async function sendNotifyEmail(toEmail, toName, subject, message, passNo) {
  if (!toEmail) return;
  if (EMAILJS_SERVICE_ID === "YOUR_SERVICE_ID") {
    console.warn("EmailJS not configured yet — skipping email:", subject, "to", toEmail);
    return;
  }
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: toEmail,
      to_name: toName || toEmail,
      subject: subject,
      message: message,
      pass_no: passNo || "",
      link: window.location.origin + window.location.pathname
    });
  } catch (e) {
    console.error("Email send failed:", e);
  }
}

// ---------- Cloudinary ----------
const CLOUDINARY_CLOUD_NAME = "yv2qgreu";
const CLOUDINARY_UPLOAD_PRESET = "nbc_property_removal";

async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  fd.append("folder", "nbc_property_removal");
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ---------- Static reference data (seeded to Firestore on first admin login) ----------
const DEPARTMENTS_DEFAULT = [
  { id: "administration", name_th: "Administration", l1_email: "thippawan_sonmahachan@natureworkspla.com", l1_name: "Thippawan Sonmahachan" },
  { id: "ehs", name_th: "Safety Department", l1_email: "kulitsara_kralam@natureworkspla.com", l1_name: "Kulitsara Kralam" },
  { id: "fermentation_lab", name_th: "Fermentation Lab", l1_email: "nantana_intanil@natureworkspla.com", l1_name: "Nantana Intanil" },
  { id: "hr", name_th: "HR", l1_email: "tassaneewan_surapraseart@natureworkspla.com", l1_name: "Tassaneewan Surapraseart" },
  { id: "it", name_th: "IT", l1_email: "amornthep_phueakphibool@natureworkspla.com", l1_name: "Amornthep Phueakphibool" },
  { id: "maintenance_reliability", name_th: "Maintenance & Reliability", l1_email: "warakorn_nuntaya@natureworkspla.com", l1_name: "Warakorn Nuntaya" },
  { id: "production", name_th: "Production", l1_email: "waron_sasipaworamet@natureworkspla.com", l1_name: "Waron Sasipaworamet" },
  { id: "qa_qc", name_th: "QA/QC", l1_email: "nantana_intanil@natureworkspla.com", l1_name: "Nantana Intanil" },
  { id: "warehouse", name_th: "Warehouse", l1_email: "puthapon_sookjit@natureworkspla.com", l1_name: "Puthapon Sookjit" },
  { id: "environment", name_th: "Environment Department", l1_email: "mike_bassett@natureworksllc.com", l1_name: "Mike Bassett" }
];
// Live, possibly Firestore-overridden copy — this is what the rest of the app reads from.
// Admin Settings edits update Firestore AND this array in memory (see loadDynamicConfig()).
let DEPARTMENTS = DEPARTMENTS_DEFAULT.map(d => ({ ...d }));

const REMOVAL_TYPES = [
  { id: "repair", th: "ซ่อม", en: "Repair", requires_return: true },
  { id: "calibration", th: "สอบเทียบ", en: "Calibration", requires_return: true },
  { id: "return_vendor", th: "คืนผู้ให้บริการ", en: "Return to Vendor", requires_return: false },
  { id: "external_testing", th: "ทดสอบภายนอก", en: "External Testing", requires_return: true },
  { id: "sale", th: "ขายออก", en: "Sale", requires_return: false },
  { id: "other", th: "อื่นๆ", en: "Other", requires_return: true }
];

const UNITS = ["ชิ้น", "กล่อง", "ม้วน", "เครื่อง", "ใบ", "ชุด", "อัน", "กก."];

const L2_APPROVERS_DEFAULT = [
  { email: "mike_bassett@natureworksllc.com", name: "Mike Bassett" },
  { email: "sirisak_charoenkitpeeti@natureworkspla.com", name: "Sirisak Charoenkitpeeti" },
  { email: "sippakorn_rattanaphun@natureworkspla.com", name: "Sippakorn Rattanaphun" },
  { email: "bill_suehr@natureworksllc.com", name: "Bill Suehr" }
];
// Live, possibly Firestore-overridden copy — this is what the rest of the app reads from.
let L2_APPROVERS = L2_APPROVERS_DEFAULT.map(a => ({ ...a }));

// Recipients notified whenever a requester submits a Return Notice (security + EHS return-confirmer group)
// EHS return-confirmer group (also used as the final "Safety Department Head" closing recipients)
const EHS_GROUP = [
  { email: "kulitsara_kralam@natureworkspla.com", name: "Kulitsara Kralam" },
  { email: "kannikar_thaicharoen@natureworkspla.com", name: "Kannikar Thaicharoen (NW)" },
  { email: "naowadee_kotwit@natureworkspla.com", name: "Naowadee Kotwit" },
  { email: "monthean_sathirayakorn@natureworkspla.com", name: "Monthean Sathirayakorn" }
];
// Recipients notified when goods are handed to Security/Safety for gate-in inspection
const RETURN_NOTICE_RECIPIENTS = [
  { email: "nbc_guardhouse@natureworkspla.com", name: "รปภ. (Guardhouse)" },
  ...EHS_GROUP
];

// email(lowercase) -> profile
// NOTE: dept_manager and l2_approver roles are now derived DYNAMICALLY at login time by matching the
// logging-in email against the live DEPARTMENTS / L2_APPROVERS lists (which Test Admin can edit from the
// Admin Settings tab, backed by Firestore). This directory now only covers roles that are NOT tied to an
// editable list: Test Admin, Admin (+return-confirmer), and Security.
const APPROVER_DIRECTORY = {
  "kannikar.thaicharoen@gmail.com": { name: "Kannikar Thaicharoen", roles: ["admin", "test_admin", "return_confirmer"], dashboard: "all" },
  "kannikar_thaicharoen@natureworkspla.com": { name: "Kannikar Thaicharoen (NW)", roles: ["admin", "test_admin", "return_confirmer"], dashboard: "all" },
  "kulitsara_kralam@natureworkspla.com": { name: "Kulitsara Kralam", roles: ["admin", "return_confirmer"], dashboard: "all" },
  "naowadee_kotwit@natureworkspla.com": { name: "Naowadee Kotwit", roles: ["admin", "return_confirmer"], dashboard: "all" },
  "monthean_sathirayakorn@natureworkspla.com": { name: "Monthean Sathirayakorn", roles: ["admin", "return_confirmer"], dashboard: "all" },
  "nbc_guardhouse@natureworkspla.com": { name: "รปภ. (Guardhouse)", roles: ["security"], dashboard: "none" }
};

// Fetch Firestore overrides for DEPARTMENTS / L2_APPROVERS and apply them to the live arrays above.
// Called once at startup; awaited before resolving a user's role so newly-added/changed approvers get
// correct permissions immediately on their next login — no code change or redeploy needed.
async function loadDynamicConfig() {
  try {
    const deptSnap = await db.collection("departments").get();
    deptSnap.forEach(doc => {
      const data = doc.data();
      const target = DEPARTMENTS.find(d => d.id === doc.id);
      if (target) {
        if (data.l1_email) target.l1_email = data.l1_email.toLowerCase();
        if (data.l1_name) target.l1_name = data.l1_name;
      }
    });
  } catch (e) { console.error("Failed to load departments config:", e); }

  try {
    const l2Snap = await db.collection("l2Approvers").get();
    if (!l2Snap.empty) {
      L2_APPROVERS = l2Snap.docs.map(doc => ({ email: (doc.data().email || doc.id).toLowerCase(), name: doc.data().name || doc.id }));
    }
  } catch (e) { console.error("Failed to load l2Approvers config:", e); }
}

const configLoadedPromise = loadDynamicConfig();

const SECURITY_OUT_REJECT_REASONS = [
  "ของไม่ตรงกับรายการที่ขออนุมัติ",
  "จำนวนของไม่ครบตามที่ระบุ",
  "ไม่มีใบอนุมัติ/เอกสารครบถ้วน",
  "สภาพของผิดปกติ/ต้องสงสัย",
  "อื่นๆ โปรดระบุ"
];
const RETURN_REJECT_REASONS = [
  "ของไม่ครบตามรายการที่นำออกไป",
  "สภาพของเสียหาย/ผิดปกติ",
  "นำของกลับมาผิดชิ้น/ผิดประเภท",
  "อื่นๆ โปรดระบุ"
];
const CURRENCIES = ["THB", "USD", "EUR", "JPY", "CNY", "GBP"];

const STATUS_LABEL = {
  pending_l1: "รออนุมัติ (ขั้น 1)",
  pending_l2: "รออนุมัติ (ขั้น 2)",
  approved: "อนุมัติ",
  issued: "ออกแล้ว",
  return_pending_requester: "รอผู้ขอตรวจสอบของนำเข้า",
  return_pending_security: "รอ รปภ./Safety ตรวจสอบของนำเข้า",
  return_pending_l1: "รอผจก.แผนกอนุมัติปิดคำขอ",
  return_pending_ehs: "รอ Safety Department Head ปิดคำขอ",
  returned: "ปิดคำขอแล้ว (คืนของเรียบร้อย)",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิกโดยผู้ขอ"
};

const ALLOWED_EMAIL_DOMAINS = ["natureworkspla.com", "natureworksllc.com", "natureworksco.com", "gmail.com"];

// ---------- Global state ----------
let currentUser = null;      // firebase auth user
let currentProfile = null;   // {name, roles, department, dashboard, email}
let allPasses = [];          // cache of pass docs
let unsubPasses = null;
let currentTab = "passes";
let currentSubFilter = "all";
let itemCounter = 0;
let newRequestItems = [];    // [{id, name, qty, unit, note, photoUrls: [], uploading}]

// =========================================================
// AUTH
// =========================================================
function toggleAuthMode(mode) {
  document.getElementById("authMsg").classList.add("hidden");
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("signupForm").classList.add("hidden");
  document.getElementById("forgotForm").classList.add("hidden");
  if (mode === "signup") {
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("authTitle").textContent = "สมัครใช้งาน";
  } else if (mode === "forgot") {
    document.getElementById("forgotForm").classList.remove("hidden");
    document.getElementById("authTitle").textContent = "ลืมรหัสผ่าน";
  } else {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("authTitle").textContent = "เข้าสู่ระบบ";
  }
}

async function doForgotPassword() {
  const name = document.getElementById("forgotName").value.trim();
  const email = document.getElementById("forgotEmail").value.trim().toLowerCase();
  if (!name) return showAuthMsg("กรุณากรอกชื่อ-นามสกุล", "err");
  if (!email) return showAuthMsg("กรุณากรอก Email", "err");
  const btn = document.getElementById("btnForgot");
  btn.disabled = true; btn.innerHTML = '<span class="loadingSpin"></span>กำลังแจ้ง...';
  try {
    EHS_GROUP.forEach(r => {
      sendNotifyEmail(
        r.email, r.name,
        biSubject("มีคนแจ้งลืมรหัสผ่าน - โปรดช่วยรีเซ็ตบัญชี", "Password reset requested — please assist"),
        biMessage(
          name + " (" + email + ") แจ้งลืมรหัสผ่านในระบบ Plant Property Removal Request กรุณาเข้า Firebase Console → Authentication → Users → ค้นหา Email นี้ → Delete account จากนั้นแจ้งให้เขาสมัครใช้งานใหม่ด้วย Email เดิม (ประวัติคำขอและสิทธิ์การใช้งานเดิมจะไม่หายไปไหน เพราะผูกกับ Email)",
          name + " (" + email + ") has reported a forgotten password for the Plant Property Removal Request system. Please go to Firebase Console → Authentication → Users → find this email → Delete account, then ask them to sign up again with the same email (their request history and access rights will remain intact, since everything is tied to email, not the account itself)."
        ),
        ""
      );
    });
    showAuthMsg("แจ้งทีม Safety Department แล้ว กรุณารอการติดต่อกลับเพื่อรีเซ็ตบัญชี จากนั้นกลับมาสมัครใช้งานใหม่ด้วย Email เดิม", "ok");
  } catch (e) {
    showAuthMsg("เกิดข้อผิดพลาด: " + e.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "แจ้งทีม Safety ให้รีเซ็ตบัญชี";
  }
}

function showAuthMsg(msg, type) {
  const el = document.getElementById("authMsg");
  el.textContent = msg;
  el.className = "authMsg " + (type === "err" ? "err" : "ok");
  el.classList.remove("hidden");
}

function emailDomainOk(email) {
  const d = email.split("@")[1] || "";
  return ALLOWED_EMAIL_DOMAINS.includes(d.toLowerCase());
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  if (!email || !pw) { showAuthMsg("กรอก Email และ Password ให้ครบ", "err"); return; }
  const btn = document.getElementById("btnLogin");
  btn.disabled = true; btn.innerHTML = '<span class="loadingSpin"></span>กำลังเข้าสู่ระบบ...';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    showAuthMsg(translateAuthErr(e), "err");
  } finally {
    btn.disabled = false; btn.textContent = "เข้าสู่ระบบ";
  }
}

async function doSignup() {
  const name = document.getElementById("suName").value.trim();
  const email = document.getElementById("suEmail").value.trim();
  const pw = document.getElementById("suPassword").value;
  if (!name || !email || !pw) { showAuthMsg("กรอกข้อมูลให้ครบ", "err"); return; }
  if (!emailDomainOk(email)) { showAuthMsg("กรุณาใช้ Email บริษัท (@natureworkspla.com หรือ @natureworksco.com)", "err"); return; }
  if (pw.length < 6) { showAuthMsg("Password ต้องมีอย่างน้อย 6 ตัวอักษร", "err"); return; }
  const btn = document.getElementById("btnSignup");
  btn.disabled = true; btn.innerHTML = '<span class="loadingSpin"></span>กำลังสมัคร...';
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await cred.user.updateProfile({ displayName: name });
    await db.collection("users").doc(email.toLowerCase()).set({
      name, email: email.toLowerCase(), created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    showAuthMsg(translateAuthErr(e), "err");
  } finally {
    btn.disabled = false; btn.textContent = "สมัครใช้งาน";
  }
}

function translateAuthErr(e) {
  const code = e.code || "";
  if (code.includes("email-already-in-use")) return "Email นี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบแทน";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Email หรือ Password ไม่ถูกต้อง";
  if (code.includes("user-not-found")) return "ไม่พบบัญชีนี้ กรุณาสมัครใช้งานก่อน";
  if (code.includes("invalid-email")) return "รูปแบบ Email ไม่ถูกต้อง";
  if (code.includes("weak-password")) return "Password ควรมีอย่างน้อย 6 ตัวอักษร";
  return "เกิดข้อผิดพลาด: " + (e.message || code);
}

function doLogout() {
  if (unsubPasses) unsubPasses();
  auth.signOut();
}

function openChangePasswordModal() {
  const modalHtml = `
  <div class="modalOverlay" onclick="if(event.target.classList.contains('modalOverlay'))closeModal()">
    <div class="modalBox" style="max-width:420px;">
      <div class="modalHead">
        <h2>เปลี่ยนรหัสผ่าน</h2>
        <button onclick="closeModal()">✕</button>
      </div>
      <div id="cpwMsg" class="authMsg hidden" style="margin-top:14px;"></div>
      <div class="field" style="margin-top:14px;"><label>รหัสผ่านปัจจุบัน</label><input type="password" id="cpwCurrent" placeholder="••••••••"></div>
      <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label><input type="password" id="cpwNew" placeholder="••••••••"></div>
      <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="cpwConfirm" placeholder="••••••••"></div>
      <div class="formActions">
        <button class="btnPrimary" style="width:auto;" id="btnChangePw" onclick="submitChangePassword()">บันทึกรหัสผ่านใหม่</button>
        <button class="btnGhost" onclick="closeModal()">ยกเลิก</button>
      </div>
    </div>
  </div>`;
  document.getElementById("modalRoot").innerHTML = modalHtml;
}

function showCpwMsg(msg, type) {
  const el = document.getElementById("cpwMsg");
  el.textContent = msg;
  el.className = "authMsg " + (type === "err" ? "err" : "ok");
  el.classList.remove("hidden");
}

async function submitChangePassword() {
  const current = document.getElementById("cpwCurrent").value;
  const next = document.getElementById("cpwNew").value;
  const confirm = document.getElementById("cpwConfirm").value;
  if (!current || !next || !confirm) return showCpwMsg("กรุณากรอกข้อมูลให้ครบ", "err");
  if (next.length < 6) return showCpwMsg("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", "err");
  if (next !== confirm) return showCpwMsg("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน", "err");
  const btn = document.getElementById("btnChangePw");
  btn.disabled = true; btn.innerHTML = '<span class="loadingSpin"></span>กำลังบันทึก...';
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(next);
    showToast("เปลี่ยนรหัสผ่านสำเร็จ", "ok");
    closeModal();
  } catch (e) {
    showCpwMsg(translateAuthErr(e), "err");
    btn.disabled = false; btn.textContent = "บันทึกรหัสผ่านใหม่";
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    const email = (user.email || "").toLowerCase();
    await configLoadedPromise; // make sure Admin-edited departments/L2 approvers are loaded before resolving role
    currentProfile = await resolveUserProfile(email, user.displayName);
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    document.getElementById("ubName").textContent = currentProfile.name;
    document.getElementById("ubRole").textContent = roleLabel(currentProfile.roles);
    document.getElementById("adminTabBtn").style.display = currentProfile.roles.includes("test_admin") ? "" : "none";
    applyTabVisibility();
    listenToPasses();
    switchTab(defaultTabFor(currentProfile));
  } else {
    currentUser = null; currentProfile = null;
    if (unsubPasses) { unsubPasses(); unsubPasses = null; }
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appShell").style.display = "none";
  }
});

async function resolveUserProfile(email, authDisplayName) {
  const dirEntry = APPROVER_DIRECTORY[email];
  let roles = dirEntry ? [...dirEntry.roles] : [];
  let department = dirEntry ? dirEntry.department : null;
  let dashboard = dirEntry ? dirEntry.dashboard : "none";
  let name = dirEntry ? dirEntry.name : null;

  // Dynamic dept-manager check — source of truth is the live DEPARTMENTS list (editable in Admin Settings)
  const deptMatches = DEPARTMENTS.filter(d => d.l1_email === email);
  if (deptMatches.length > 0) {
    roles.push("dept_manager");
    department = deptMatches.length === 1 ? deptMatches[0].id : deptMatches.map(d => d.id);
    if (!dashboard || dashboard === "none") dashboard = "own_dept";
    if (!name) name = deptMatches[0].l1_name;
  }

  // Dynamic L2-approver check — source of truth is the live L2_APPROVERS list (editable in Admin Settings)
  const l2Match = L2_APPROVERS.find(a => a.email === email);
  if (l2Match) {
    roles.push("l2_approver");
    if (!name) name = l2Match.name;
  }

  if (roles.length === 0) {
    // general requester — try to load their signup name
    let displayName = authDisplayName || email;
    try {
      const udoc = await db.collection("users").doc(email).get();
      if (udoc.exists) displayName = udoc.data().name || displayName;
    } catch (e) {}
    return { email, name: displayName, roles: ["requester"], department: null, dashboard: "none" };
  }

  return { email, name: name || authDisplayName || email, roles: [...new Set(roles)], department, dashboard };
}

function roleLabel(roles) {
  if (roles.includes("test_admin")) return "Test Admin";
  if (roles.includes("admin")) return "Admin / Safety";
  if (roles.includes("l2_approver")) return "ผู้อนุมัติขั้น 2";
  if (roles.includes("dept_manager")) return "Department Manager";
  if (roles.includes("security")) return "Security / รปภ.";
  return "ผู้ขอทั่วไป (Requester)";
}

function defaultTabFor(profile) {
  if (profile.roles.includes("security")) return "passes";
  return "passes";
}

function applyTabVisibility() {
  const showDash = currentProfile.dashboard !== "none";
  const btn = document.querySelector('#mainTabs button[data-tab="dashboard"]');
  btn.style.display = showDash ? "" : "none";
}

// =========================================================
// TAB SWITCHING
// =========================================================
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll("#mainTabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  ["passes", "newrequest", "tracking", "dashboard", "admin"].forEach(t => {
    document.getElementById("view-" + t).classList.toggle("hidden", t !== tab);
  });
  if (tab === "passes") renderPassesView();
  if (tab === "newrequest") renderNewRequestView();
  if (tab === "tracking") renderTrackingView();
  if (tab === "dashboard") renderDashboardView();
  if (tab === "admin") renderAdminView();
}

// =========================================================
// FIRESTORE LISTENERS
// =========================================================
function listenToPasses() {
  if (unsubPasses) unsubPasses();
  unsubPasses = db.collection("passes").orderBy("created_at", "desc").onSnapshot(snap => {
    allPasses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === "passes") renderPassesView();
    if (currentTab === "tracking") renderTrackingView();
    if (currentTab === "dashboard") renderDashboardView();
  }, err => {
    console.error(err);
    showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, "err");
  });
}

// =========================================================
// HELPERS
// =========================================================
function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = type === "err" ? "err" : (type === "ok" ? "ok" : "");
  t.style.display = "block";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.style.display = "none"; }, 3200);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const datePart = d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return datePart + " " + hh + ":" + mm + " น.";
}

function fmtMoney(val, currency) {
  if (val === undefined || val === null || val === "") return "-";
  const num = Number(val);
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatted + " " + (currency || "THB");
}

function reasonDropdownHtml(idPrefix, reasons) {
  return '<div class="field"><label>เหตุผล (กรณีปฏิเสธ) *</label>' +
    '<select id="' + idPrefix + '_select" onchange="onReasonSelectChange(\'' + idPrefix + '\')">' +
    '<option value="">เลือกเหตุผล</option>' +
    reasons.map(r => '<option value="' + escapeHtml(r) + '">' + escapeHtml(r) + '</option>').join("") +
    '</select></div>' +
    '<div class="field hidden" id="' + idPrefix + '_otherWrap"><label>โปรดระบุ *</label><input type="text" id="' + idPrefix + '_otherText" placeholder="ระบุเหตุผลเพิ่มเติม..."></div>';
}

function onReasonSelectChange(idPrefix) {
  const sel = document.getElementById(idPrefix + "_select").value;
  document.getElementById(idPrefix + "_otherWrap").classList.toggle("hidden", sel !== "อื่นๆ โปรดระบุ");
}

function getReasonValue(idPrefix) {
  const selEl = document.getElementById(idPrefix + "_select");
  const sel = selEl ? selEl.value : "";
  if (!sel) { showToast("กรุณาเลือกเหตุผลในการปฏิเสธ", "err"); return null; }
  if (sel === "อื่นๆ โปรดระบุ") {
    const otherEl = document.getElementById(idPrefix + "_otherText");
    const other = otherEl ? otherEl.value.trim() : "";
    if (!other) { showToast("กรุณาระบุเหตุผลเพิ่มเติม", "err"); return null; }
    return "อื่นๆ: " + other;
  }
  return sel;
}

function deptNameById(id) {
  const d = DEPARTMENTS.find(x => x.id === id);
  return d ? d.name_th : id;
}

function removalTypeById(id) {
  return REMOVAL_TYPES.find(x => x.id === id) || null;
}

function openLightbox(url) {
  document.getElementById("lbImg").src = url;
  document.getElementById("lbDownload").href = url;
  document.getElementById("lightbox").style.display = "flex";
}
function closeLightbox() { document.getElementById("lightbox").style.display = "none"; }

function visibleDeptIdsForCurrentUser() {
  const dep = currentProfile.department;
  if (!dep) return [];
  return Array.isArray(dep) ? dep : [dep];
}

// Passes visible to current user according to permission matrix
function getVisiblePasses(list) {
  const roles = currentProfile.roles;
  if (roles.includes("test_admin") || roles.includes("admin") || roles.includes("security") || roles.includes("requester")) {
    return list; // see all
  }
  if (roles.includes("dept_manager")) {
    const depts = visibleDeptIdsForCurrentUser();
    return list.filter(p => depts.includes(p.requester_dept));
  }
  if (roles.includes("l2_approver")) {
    return list.filter(p => p.approver_l2_email === currentProfile.email);
  }
  return list;
}

// PASSES LIST VIEW rendering, new request form, detail modal, tracking, dashboard, admin views appended below.

function renderPassesView() {
  const el = document.getElementById("view-passes");
  const roles = currentProfile.roles;
  const subtabs = [{ id: "all", label: "All / ทั้งหมด" }];
  if (roles.includes("dept_manager") || roles.includes("test_admin")) {
    subtabs.push({ id: "pending_approval", label: "Pending Approval / รอฉัน (ผจก.)" });
  }
  if (roles.includes("l2_approver") || roles.includes("test_admin")) {
    subtabs.push({ id: "my_approval", label: "My Approval / รออนุมัติ" });
  }
  if (roles.includes("security") || roles.includes("return_confirmer") || roles.includes("test_admin")) {
    subtabs.push({ id: "security_check", label: "Security Check / รปภ." });
  }

  let visible = getVisiblePasses(allPasses);

  if (currentSubFilter === "pending_approval") {
    const depts = visibleDeptIdsForCurrentUser();
    const ehsMgrEmail = (DEPARTMENTS.find(d => d.id === "ehs") || {}).l1_email;
    visible = allPasses.filter(p =>
      ((p.status === "pending_l1" || p.ext_status === "pending_l1" || p.status === "return_pending_l1") && (depts.includes(p.requester_dept) || roles.includes("test_admin"))) ||
      (p.status === "return_pending_ehs" && (currentProfile.email === ehsMgrEmail || roles.includes("test_admin")))
    );
  } else if (currentSubFilter === "my_approval") {
    visible = allPasses.filter(p => (p.status === "pending_l2" || p.ext_status === "pending_l2") && (p.approver_l2_email === currentProfile.email || roles.includes("test_admin")));
  } else if (currentSubFilter === "security_check") {
    visible = allPasses.filter(p => p.status === "approved" || (p.status === "return_pending_security" && p.requires_return));
  }

  const search = (document.getElementById("passSearch") ? document.getElementById("passSearch").value : "").trim().toLowerCase();
  const statusFilter = document.getElementById("passStatusFilter") ? document.getElementById("passStatusFilter").value : "all";
  if (search) {
    visible = visible.filter(p =>
      (p.pass_no || "").toLowerCase().includes(search) ||
      (p.requester_name || "").toLowerCase().includes(search) ||
      deptNameById(p.requester_dept).toLowerCase().includes(search)
    );
  }
  if (statusFilter !== "all") visible = visible.filter(p => p.status === statusFilter);

  let html = '<div class="subtabs">';
  subtabs.forEach(t => {
    html += '<button class="' + (currentSubFilter === t.id ? "active" : "") + '" onclick="setSubFilter(\'' + t.id + '\')">' + t.label + '</button>';
  });
  html += '</div>';

  html += '<div class="searchRow">' +
    '<input type="text" id="passSearch" placeholder="Search by pass no. / name / dept..." value="' + escapeHtml(search) + '" oninput="renderPassesView()">' +
    '<select id="passStatusFilter" onchange="renderPassesView()">' +
    '<option value="all"' + (statusFilter === "all" ? " selected" : "") + '>All / ทุกสถานะ</option>' +
    Object.keys(STATUS_LABEL).map(s => '<option value="' + s + '"' + (statusFilter === s ? " selected" : "") + '>' + STATUS_LABEL[s] + '</option>').join("") +
    '</select>' +
    '<button class="btnNew" onclick="switchTab(\'newrequest\')">+ New Request / สร้างคำขอ</button>' +
    '</div>';

  if (visible.length === 0) {
    html += '<div class="emptyState">ไม่พบรายการ / No passes found</div>';
  } else {
    visible.forEach(p => { html += passCardHtml(p); });
  }

  el.innerHTML = html;
}

function setSubFilter(id) { currentSubFilter = id; renderPassesView(); }

function passCardHtml(p) {
  const overdue = isOverdue(p);
  const badgeClass = overdue ? "overdue" : p.status;
  const badgeText = overdue ? "Overdue" : (STATUS_LABEL[p.status] || p.status);
  const rt = removalTypeById(p.removal_type);
  const extBadge = p.ext_status ? '<span class="badge ext-badge" style="margin-left:6px;">ขอต่ออายุ ครั้งที่ ' + ((p.ext_count || 0) + 1) + '</span>' : "";
  return '<div class="passCard" onclick="openPassDetail(\'' + p.id + '\')">' +
    '<div class="row1">' +
    '<div>' +
    '<div class="passNo">' + escapeHtml(p.pass_no) + '</div>' +
    '<div class="who">' + escapeHtml(p.requester_name) + ' — ' + escapeHtml(deptNameById(p.requester_dept)) + '</div>' +
    '<div class="meta">' + (rt ? escapeHtml(rt.th) + "/" + escapeHtml(rt.en) : "") + (p.due_date ? " · Due: " + escapeHtml(p.due_date) : "") + '</div>' +
    '</div>' +
    '<div style="text-align:right;">' +
    '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' + extBadge +
    '</div>' +
    '</div>' +
    '</div>';
}

function isOverdue(p) {
  if (!p.requires_return) return false;
  if (p.status !== "issued") return false;
  if (!p.due_date) return false;
  return new Date(p.due_date) < new Date(new Date().toDateString());
}

function renderNewRequestView() {
  newRequestItems = [{ id: ++itemCounter, name: "", qty: 1, unit: "", note: "", photoUrls: [], uploading: false }];
  const el = document.getElementById("view-newrequest");
  el.innerHTML =
    '<div class="formCard">' +
      '<h3>ข้อมูลผู้ขอ / Requester Information</h3>' +
      '<div class="grid2">' +
        '<div class="field"><label>แผนก *</label>' +
          '<select id="reqDept" onchange="onDeptChange()">' +
            '<option value="">เลือกแผนก</option>' +
            DEPARTMENTS.map(d => '<option value="' + d.id + '">' + d.name_th + '</option>').join("") +
          '</select>' +
        '</div>' +
        '<div class="field"><label>ชื่อผู้ขอ *</label><input type="text" id="reqName" placeholder="ชื่อ-นามสกุล" value="' + escapeHtml(currentProfile.name) + '"></div>' +
        '<div class="field"><label>เบอร์โทร</label><input type="text" id="reqPhone" placeholder="08x-xxx-xxxx"></div>' +
        '<div class="field"><label>วัตถุประสงค์ในการนำออก *</label>' +
          '<select id="reqPurpose" onchange="onPurposeChange()">' +
            '<option value="">เลือกวัตถุประสงค์</option>' +
            REMOVAL_TYPES.map(r => '<option value="' + r.id + '">' + r.th + ' / ' + r.en + '</option>').join("") +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="formCard">' +
      '<h3>รายละเอียดการนำออก / Removal Details</h3>' +
      '<div class="grid2">' +
        '<div class="field"><label>ปลายทาง</label><input type="text" id="reqDestination" placeholder="สถานที่ปลายทาง"></div>' +
        '<div class="field"><label>ทะเบียนรถ</label><input type="text" id="reqVehicle" placeholder="1กข-1234"></div>' +
        '<div class="field"><label>ผู้อนุมัติขั้น 1 (อัตโนมัติตามแผนก)</label>' +
          '<div class="readonlyBox" id="reqL1Box">— เลือกแผนกก่อน —</div>' +
        '</div>' +
        '<div class="field"><label>ผู้อนุมัติขั้น 2 *</label>' +
          '<select id="reqL2">' +
            '<option value="">เลือกผู้อนุมัติขั้น 2</option>' +
            L2_APPROVERS.map(a => '<option value="' + a.email + '">' + a.name + '</option>').join("") +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field" id="dueDateWrap" style="margin-top:14px;display:none;">' +
        '<label>กำหนดวันนำกลับ (Due date)</label>' +
        '<input type="date" id="reqDueDate">' +
      '</div>' +
      '<div class="grid2" style="margin-top:14px;">' +
        '<div class="field"><label>มูลค่าสินค้า (โดยประมาณ) *</label><input type="number" min="0" step="0.01" id="reqItemValue" placeholder="0.00"></div>' +
        '<div class="field"><label>สกุลเงิน</label><select id="reqCurrency">' +
          CURRENCIES.map(c => '<option value="' + c + '"' + (c === "THB" ? " selected" : "") + '>' + c + '</option>').join("") +
        '</select></div>' +
      '</div>' +
      '<div class="field" style="margin-top:14px;"><label>หมายเหตุ</label><textarea id="reqNote" rows="2" placeholder="หมายเหตุเพิ่มเติม..."></textarea></div>' +
    '</div>' +

    '<div class="formCard">' +
      '<h3>รายการของ / Items <span style="font-weight:400;color:var(--muted);font-size:12px;">— ต้องแนบรูปถ่ายของทุกรายการ *</span></h3>' +
      '<div id="itemsContainer"></div>' +
      '<button class="addItemBtn" onclick="addItemRow()">+ เพิ่มรายการ</button>' +
    '</div>' +

    '<div class="formActions">' +
      '<button class="btnPrimary" style="width:auto;" id="btnSubmitRequest" onclick="submitNewRequest()">ส่งคำขอ / Submit</button>' +
      '<button class="btnGhost" onclick="switchTab(\'passes\')">ยกเลิก / Cancel</button>' +
    '</div>';
  renderItemRows();
}

function onDeptChange() {
  const deptId = document.getElementById("reqDept").value;
  const dept = DEPARTMENTS.find(d => d.id === deptId);
  document.getElementById("reqL1Box").textContent = dept ? (dept.l1_name + " (" + dept.name_th + ")") : "— เลือกแผนกก่อน —";
}

function onPurposeChange() {
  const rt = removalTypeById(document.getElementById("reqPurpose").value);
  document.getElementById("dueDateWrap").style.display = (rt && rt.requires_return) ? "" : "none";
}

function addItemRow() {
  newRequestItems.push({ id: ++itemCounter, name: "", qty: 1, unit: "", note: "", photoUrls: [], uploading: false });
  renderItemRows();
}
function removeItemRow(id) {
  newRequestItems = newRequestItems.filter(i => i.id !== id);
  renderItemRows();
}

function renderItemRows() {
  const c = document.getElementById("itemsContainer");
  c.innerHTML = newRequestItems.map((it, idx) => {
    return '<div class="itemBlock">' +
      (newRequestItems.length > 1 ? '<button class="removeItem" onclick="removeItemRow(' + it.id + ')">✕ ลบ</button>' : "") +
      '<div class="itemTitle">รายการที่ ' + (idx + 1) + '</div>' +
      '<div class="grid2">' +
        '<div class="field"><label>ชื่อของ *</label><input type="text" value="' + escapeHtml(it.name) + '" oninput="updateItemField(' + it.id + ',\'name\',this.value)" placeholder="ชื่ออุปกรณ์/ของ"></div>' +
        '<div class="grid2" style="gap:10px;">' +
          '<div class="field"><label>จำนวน</label><input type="number" min="1" value="' + it.qty + '" oninput="updateItemField(' + it.id + ',\'qty\',this.value)"></div>' +
          '<div class="field"><label>หน่วย</label><select onchange="updateItemField(' + it.id + ',\'unit\',this.value)">' +
            '<option value="">เลือกหน่วย</option>' +
            UNITS.map(u => '<option value="' + u + '"' + (it.unit === u ? " selected" : "") + '>' + u + '</option>').join("") +
          '</select></div>' +
        '</div>' +
      '</div>' +
      '<div class="field" style="margin-top:10px;">' +
        '<label>รูปถ่ายของ * (แนบได้หลายรูป เช่น ก่อนแพ็ค/หลังแพ็ค)</label>' +
        '<div class="photoThumbGrid">' +
          it.photoUrls.map((url, pidx) =>
            '<div class="photoThumb"><img src="' + url + '"><button type="button" class="rm" onclick="removeItemPhoto(' + it.id + ',' + pidx + ')">✕</button></div>'
          ).join("") +
          (it.uploading ?
            '<div class="photoAddTile"><div class="icon">⏳</div><div>อัปโหลด...</div></div>' :
            '<div class="photoAddTile" onclick="document.getElementById(\'file_' + it.id + '\').click()"><div class="icon">📷</div><div>เพิ่มรูป</div></div>') +
        '</div>' +
        '<input type="file" id="file_' + it.id + '" accept="image/*" capture="environment" class="hidden" onchange="onItemPhotoSelected(' + it.id + ', this.files[0]); this.value=\'\';">' +
      '</div>' +
      '<div class="field" style="margin-top:10px;"><label>หมายเหตุรายการ</label><input type="text" value="' + escapeHtml(it.note) + '" oninput="updateItemField(' + it.id + ',\'note\',this.value)" placeholder="หมายเหตุ (ถ้ามี)"></div>' +
    '</div>';
  }).join("");
}

function updateItemField(id, field, value) {
  const it = newRequestItems.find(i => i.id === id);
  if (!it) return;
  it[field] = field === "qty" ? Number(value) : value;
}

async function onItemPhotoSelected(id, file) {
  if (!file) return;
  const it = newRequestItems.find(i => i.id === id);
  it.uploading = true;
  renderItemRows();
  try {
    const url = await uploadToCloudinary(file);
    it.photoUrls.push(url);
  } catch (e) {
    showToast("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", "err");
  } finally {
    it.uploading = false;
    renderItemRows();
  }
}

function removeItemPhoto(id, photoIdx) {
  const it = newRequestItems.find(i => i.id === id);
  if (!it) return;
  it.photoUrls.splice(photoIdx, 1);
  renderItemRows();
}

async function getNextPassNo() {
  const beYear = new Date().getFullYear() + 543;
  const counterRef = db.collection("counters").doc("GP-" + beYear);
  const seq = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const next = doc.exists ? (doc.data().seq || 0) + 1 : 1;
    tx.set(counterRef, { seq: next });
    return next;
  });
  return "GP-" + beYear + "-" + String(seq).padStart(4, "0");
}

async function submitNewRequest() {
  const dept = document.getElementById("reqDept").value;
  const name = document.getElementById("reqName").value.trim();
  const phone = document.getElementById("reqPhone").value.trim();
  const purpose = document.getElementById("reqPurpose").value;
  const destination = document.getElementById("reqDestination").value.trim();
  const vehicle = document.getElementById("reqVehicle").value.trim();
  const l2email = document.getElementById("reqL2").value;
  const note = document.getElementById("reqNote").value.trim();
  const dueDate = document.getElementById("reqDueDate") ? document.getElementById("reqDueDate").value : "";
  const itemValueRaw = document.getElementById("reqItemValue").value;
  const itemValue = itemValueRaw === "" ? null : Number(itemValueRaw);
  const itemCurrency = document.getElementById("reqCurrency").value;

  if (!dept) return showToast("กรุณาเลือกแผนก", "err");
  if (!name) return showToast("กรุณากรอกชื่อผู้ขอ", "err");
  if (!purpose) return showToast("กรุณาเลือกวัตถุประสงค์", "err");
  if (!l2email) return showToast("กรุณาเลือกผู้อนุมัติขั้น 2", "err");
  if (itemValueRaw === "") return showToast("กรุณากรอกมูลค่าสินค้า", "err");
  if (isNaN(itemValue) || itemValue < 0) return showToast("กรุณากรอกมูลค่าสินค้าเป็นตัวเลขที่ถูกต้อง", "err");
  if (newRequestItems.length === 0) return showToast("กรุณาเพิ่มรายการของอย่างน้อย 1 รายการ", "err");
  for (const it of newRequestItems) {
    if (!it.name.trim()) return showToast("กรุณากรอกชื่อของให้ครบทุกรายการ", "err");
    if (!it.photoUrls || it.photoUrls.length === 0) return showToast("กรุณาแนบรูปถ่ายอย่างน้อย 1 รูปให้ครบทุกรายการ", "err");
    if (it.uploading) return showToast("กรุณารอให้อัปโหลดรูปเสร็จก่อน", "err");
  }

  const rt = removalTypeById(purpose);
  const deptObj = DEPARTMENTS.find(d => d.id === dept);
  const l2 = L2_APPROVERS.find(a => a.email === l2email);

  const btn = document.getElementById("btnSubmitRequest");
  btn.disabled = true; btn.innerHTML = '<span class="loadingSpin"></span>กำลังส่งคำขอ...';

  try {
    const passNo = await getNextPassNo();
    await db.collection("passes").add({
      pass_no: passNo,
      requester_name: name,
      requester_dept: dept,
      requester_phone: phone,
      requester_email: currentProfile.email,
      purpose_th: rt.th, purpose_en: rt.en, removal_type: rt.id, requires_return: rt.requires_return,
      destination: destination, vehicle_plate: vehicle,
      approver_l1_email: deptObj.l1_email, approver_l1_name: deptObj.l1_name,
      approver_l2_email: l2.email, approver_l2_name: l2.name,
      note: note,
      due_date: dueDate || null,
      item_value: itemValue,
      item_value_currency: itemCurrency,
      items: newRequestItems.map(i => ({ name: i.name, qty: i.qty, unit: i.unit, note: i.note, photo_urls: i.photoUrls })),
      status: "pending_l1",
      ext_count: 0,
      ext_status: null,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ส่งคำขอสำเร็จ (" + passNo + ")", "ok");
    sendNotifyEmail(
      deptObj.l1_email, deptObj.l1_name,
      biSubject("มีคำขอนำของออกใหม่รออนุมัติ", "New removal request awaiting approval") + " - " + passNo,
      biMessage(
        name + " (" + deptObj.name_th + ") ส่งคำขอนำของออก กรุณาเข้าระบบเพื่อตรวจสอบและอนุมัติขั้นที่ 1",
        name + " (" + deptObj.name_th + ") has submitted a property removal request. Please log in to review and approve it (Level 1)."
      ),
      passNo
    );
    switchTab("passes");
  } catch (e) {
    console.error(e);
    showToast("ส่งคำขอไม่สำเร็จ: " + e.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "ส่งคำขอ / Submit";
  }
}

function openPassDetail(id) {
  const p = allPasses.find(x => x.id === id);
  if (!p) return;
  const roles = currentProfile.roles;
  // NOTE: "isTestAdmin" intentionally means the TEST ADMIN role only (full bypass, for testing every path).
  // Plain "admin" (Kulitsara/Naowadee/Monthean) gets full visibility + Dashboard + return-confirm duty
  // (handled elsewhere via getVisiblePasses / dashboard / return_confirmer role) but NOT an approve/security bypass here.
  const isTestAdmin = roles.includes("test_admin");
  const canApproveL1 = (roles.includes("dept_manager") && visibleDeptIdsForCurrentUser().includes(p.requester_dept)) || isTestAdmin;
  const canApproveL2 = (roles.includes("l2_approver") && p.approver_l2_email === currentProfile.email) || isTestAdmin;
  const canSecurityOut = (roles.includes("security") || isTestAdmin) && p.status === "approved";
  const canSelfCheckReturn = (p.requester_email === currentProfile.email || isTestAdmin) && p.status === "return_pending_requester" && p.requires_return;
  const canConfirmReturn = (roles.includes("return_confirmer") || roles.includes("security") || isTestAdmin) && p.status === "return_pending_security" && p.requires_return;
  const ehsManagerInfo = DEPARTMENTS.find(d => d.id === "ehs");
  const canApproveReturnL1 = ((roles.includes("dept_manager") && visibleDeptIdsForCurrentUser().includes(p.requester_dept)) || isTestAdmin) && p.status === "return_pending_l1";
  const canApproveReturnEhs = ((currentProfile.email === ehsManagerInfo.l1_email) || isTestAdmin) && p.status === "return_pending_ehs";
  const canNotifyReturn = (p.requester_email === currentProfile.email || isTestAdmin) && p.status === "issued" && p.requires_return && !p.ext_status;
  const canApproveExtL1 = (canApproveL1) && p.ext_status === "pending_l1";
  const canApproveExtL2 = (canApproveL2) && p.ext_status === "pending_l2";
  const canRequestExtension = (p.requester_email === currentProfile.email || isTestAdmin) && !roles.includes("security") && p.requires_return &&
    p.status === "issued" && !p.ext_status && (p.ext_count || 0) < 3;
  const canCancelRequest = (p.requester_email === currentProfile.email || isTestAdmin) &&
    ["pending_l1", "pending_l2", "approved"].includes(p.status) && !p.ext_status;

  const blocks = [];
  if (canApproveExtL1 || canApproveExtL2) {
    // A pending extension-approval gates everything else until resolved.
    blocks.push(extensionApprovalPanel(p, p.ext_status === "pending_l1" ? "l1" : "l2"));
  } else if (p.status === "pending_l1" && canApproveL1) {
    blocks.push(actionButtons(p.id, "l1"));
  } else if (p.status === "pending_l2" && canApproveL2) {
    blocks.push(actionButtons(p.id, "l2"));
  } else {
    // Status-driven actions can coexist (e.g. security/EHS confirming return, while the
    // requester-side extension option is also offered if the same account also qualifies).
    if (canSecurityOut) {
      blocks.push(
        '<div class="field"><label>รูปถ่ายยืนยันการตรวจของก่อนนำออก (รปภ.) *</label>' +
          '<div class="photoUpload" onclick="document.getElementById(\'secOutFile\').click()" id="secOutPreview">' +
            '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>' +
          '</div>' +
          '<input type="file" id="secOutFile" accept="image/*" capture="environment" class="hidden" onchange="onSecurityPhoto(this.files[0])">' +
        '</div>' +
        '<div class="formActions"><button class="btnSuccess" id="btnSecOut" onclick="confirmSecurityOut(\'' + p.id + '\')">✔ ยืนยันตรวจของ & ออกแล้ว</button></div>' +
        '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' +
          reasonDropdownHtml("secOutReject", SECURITY_OUT_REJECT_REASONS) +
          '<div class="formActions"><button class="btnDanger" onclick="rejectSecurityOut(\'' + p.id + '\')">✕ ปฏิเสธ ไม่อนุญาตนำออก</button></div>' +
        '</div>'
      );
    }
    if (canSelfCheckReturn) {
      blocks.push(
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:10px;">📦 ตรวจสอบของที่นำเข้ามา (ก่อนส่งต่อ รปภ.)</div>' +
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">แจ้งนำกลับไว้: ' + escapeHtml(p.return_notice_date || "-") + ' เวลา ' + escapeHtml(p.return_notice_time || "-") + '</div>' +
        '<div class="field"><label>รูปถ่ายยืนยันการตรวจสอบของนำเข้า *</label>' +
        '<div class="photoUpload" onclick="document.getElementById(\'selfCheckFile\').click()" id="selfCheckPreview">' +
          '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>' +
        '</div>' +
        '<input type="file" id="selfCheckFile" accept="image/*" capture="environment" class="hidden" onchange="onSelfCheckPhoto(this.files[0])">' +
      '</div>' +
      '<div class="formActions"><button class="btnSuccess" onclick="submitSelfCheckReturn(\'' + p.id + '\')">✔ ตรวจสอบแล้ว ส่งต่อให้ รปภ.</button></div>'
      );
    }
    if (canConfirmReturn) {
      blocks.push(
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:10px;">🔍 ตรวจสอบของที่นำกลับ</div>' +
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">แจ้งนำกลับ: ' + escapeHtml(p.return_notice_date || "-") + ' เวลา ' + escapeHtml(p.return_notice_time || "-") + '</div>' +
        (p.return_last_reject_reason ? '<div style="background:#FDECEC;color:var(--danger);font-size:12px;padding:8px 10px;border-radius:6px;margin-bottom:10px;">ครั้งก่อนถูกปฏิเสธ: ' + escapeHtml(p.return_last_reject_reason) + '</div>' : "") +
        '<div class="field"><label>รูปถ่ายยืนยันการตรวจของตอนคืน (รปภ./Safety) *</label>' +
        '<div class="photoUpload" onclick="document.getElementById(\'secRetFile\').click()" id="secRetPreview">' +
          '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>' +
        '</div>' +
        '<input type="file" id="secRetFile" accept="image/*" capture="environment" class="hidden" onchange="onReturnPhoto(this.files[0])">' +
      '</div>' +
      '<div class="formActions"><button class="btnSuccess" id="btnConfirmReturn" onclick="confirmReturn(\'' + p.id + '\')">✔ ยืนยันคืนของแล้ว</button></div>' +
      '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">' +
        reasonDropdownHtml("retReject", RETURN_REJECT_REASONS) +
        '<div class="formActions"><button class="btnDanger" onclick="rejectReturnCheck(\'' + p.id + '\')">✕ ปฏิเสธ ของไม่ครบ/มีปัญหา</button></div>' +
      '</div>'
      );
    }
    if (canApproveReturnL1) {
      blocks.push(
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:10px;">📋 รับทราบ & อนุมัติปิดคำขอ (ผจก.แผนก)</div>' +
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">รปภ./Safety ตรวจของแล้ว รอท่านรับทราบก่อนส่งต่อ Safety Department Head ปิดคำขอ</div>' +
        '<div class="field"><label>เหตุผล (กรณีส่งกลับให้ตรวจใหม่)</label><input type="text" id="rejReturnL1Reason" placeholder="ระบุเหตุผล..."></div>' +
        '<div class="formActions">' +
          '<button class="btnSuccess" onclick="approveReturnL1(\'' + p.id + '\')">✔ รับทราบ & ส่งต่อ Safety Department Head</button>' +
          '<button class="btnDanger" onclick="rejectReturnL1(\'' + p.id + '\')">✕ ส่งกลับให้ตรวจใหม่</button>' +
        '</div>'
      );
    }
    if (canApproveReturnEhs) {
      blocks.push(
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:10px;">✅ อนุมัติปิดคำขอ (Safety Department Head) — ขั้นตอนสุดท้าย</div>' +
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">ผจก.แผนกรับทราบแล้ว รอท่านอนุมัติปิดคำขอเป็นขั้นตอนสุดท้าย</div>' +
        '<div class="field"><label>เหตุผล (กรณีส่งกลับให้พิจารณาใหม่)</label><input type="text" id="rejReturnEhsReason" placeholder="ระบุเหตุผล..."></div>' +
        '<div class="formActions">' +
          '<button class="btnSuccess" onclick="approveReturnEhs(\'' + p.id + '\')">✔ อนุมัติปิดคำขอ</button>' +
          '<button class="btnDanger" onclick="rejectReturnEhs(\'' + p.id + '\')">✕ ส่งกลับให้พิจารณาใหม่</button>' +
        '</div>'
      );
    }
    if (canNotifyReturn) {
      blocks.push(
        '<div class="grid2">' +
          '<div class="field"><label>วันที่จะนำของกลับ *</label><input type="date" id="retNoticeDate"></div>' +
          '<div class="field"><label>เวลาโดยประมาณ *</label><input type="time" id="retNoticeTime"></div>' +
        '</div>' +
        '<div class="formActions"><button class="btnPrimary" style="width:auto;" onclick="submitReturnNotice(\'' + p.id + '\')">📩 แจ้งนำของกลับ / Notify Return</button></div>'
      );
    }
    if (canRequestExtension) {
      blocks.push(
        '<div>' +
          '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">นำของกลับตามกำหนดไม่ได้? ขอขยายเวลาได้ (ใช้แล้ว ' + (p.ext_count || 0) + '/3 ครั้ง)</div>' +
          '<div class="field"><label>วันที่กำหนดคืนใหม่ที่ต้องการ *</label><input type="date" id="extNewDate"></div>' +
          '<div class="field"><label>เหตุผล *</label><input type="text" id="extReason" placeholder="เหตุผลที่ขอขยายเวลา"></div>' +
          '<div class="formActions"><button class="btnGhost" onclick="submitExtensionRequest(\'' + p.id + '\')">⏳ ขอขยายเวลานำกลับ</button></div>' +
        '</div>'
      );
    }
  }
  if (canCancelRequest) {
    blocks.push(
      '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">เปลี่ยนใจ ไม่ต้องการนำของออกแล้ว? ยกเลิกคำขอนี้ได้ (ทำได้ก่อนของออกจากโรงงานเท่านั้น)</div>' +
      '<div class="formActions"><button class="btnDanger" onclick="cancelRequest(\'' + p.id + '\')">🗑️ ยกเลิกคำขอ</button></div>'
    );
  }
  const actionsHtml = blocks.join('<div style="height:16px;border-top:1px solid var(--border);margin-bottom:16px;"></div>');

  const itemsHtml = (p.items || []).map(it => {
    const urls = it.photo_urls || (it.photo_url ? [it.photo_url] : []);
    return '<div class="itemRowView">' +
      '<div class="info"><div class="n">' + escapeHtml(it.name) + '</div><div class="m">' + (it.qty || "") + ' ' + escapeHtml(it.unit || "") + (it.note ? " · " + escapeHtml(it.note) : "") + '</div></div>' +
      '<div class="itemPhotoRow">' +
        urls.map(url => '<img src="' + url + '" onclick="openLightbox(\'' + url + '\')">').join("") +
      '</div>' +
    '</div>';
  }).join("") || '<div style="color:var(--muted);font-size:13px;">ไม่มีรายการ</div>';

  let securityPhotosHtml = "";
  if (p.security_out_photo_url) {
    securityPhotosHtml += '<div class="itemRowView singlePhotoRow"><img src="' + p.security_out_photo_url + '" onclick="openLightbox(\'' + p.security_out_photo_url + '\')"><div class="info"><div class="n">รูปตอนออก (Security)</div><div class="m">' + fmtDate(p.security_out_at) + '</div></div></div>';
  }
  if (p.requester_check_photo_url) {
    securityPhotosHtml += '<div class="itemRowView singlePhotoRow"><img src="' + p.requester_check_photo_url + '" onclick="openLightbox(\'' + p.requester_check_photo_url + '\')"><div class="info"><div class="n">รูปตอนผู้ขอตรวจสอบของนำเข้า</div><div class="m">' + fmtDate(p.requester_check_at) + '</div></div></div>';
  }
  if (p.return_photo_url) {
    securityPhotosHtml += '<div class="itemRowView singlePhotoRow"><img src="' + p.return_photo_url + '" onclick="openLightbox(\'' + p.return_photo_url + '\')"><div class="info"><div class="n">รูปตอนคืน (รปภ./Safety)</div><div class="m">' + fmtDate(p.return_at) + '</div></div></div>';
  }

  const modalHtml =
  '<div class="modalOverlay" onclick="if(event.target.classList.contains(\'modalOverlay\'))closeModal()">' +
    '<div class="modalBox">' +
      '<div class="modalHead">' +
        '<div>' +
          '<h2>' + escapeHtml(p.pass_no) + '</h2>' +
          '<span class="badge ' + (isOverdue(p) ? "overdue" : p.status) + '">' + (isOverdue(p) ? "Overdue" : (STATUS_LABEL[p.status] || p.status)) + '</span>' +
        '</div>' +
        '<button onclick="closeModal()">✕</button>' +
      '</div>' +

      '<div class="detailSection">' +
        '<h4>ข้อมูลผู้ขอ</h4>' +
        '<div class="kv"><span class="k">ชื่อผู้ขอ</span><span>' + escapeHtml(p.requester_name) + '</span></div>' +
        '<div class="kv"><span class="k">แผนก</span><span>' + escapeHtml(deptNameById(p.requester_dept)) + '</span></div>' +
        '<div class="kv"><span class="k">เบอร์โทร</span><span>' + escapeHtml(p.requester_phone || "-") + '</span></div>' +
        '<div class="kv"><span class="k">วัตถุประสงค์</span><span>' + escapeHtml(p.purpose_th) + ' / ' + escapeHtml(p.purpose_en) + '</span></div>' +
        '<div style="background:' + (p.requires_return ? "#FFF6E5" : "#E9F7EF") + ';border:1px solid ' + (p.requires_return ? "#F5DBA0" : "#B7EBC6") + ';border-radius:8px;padding:10px 12px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
          '<span style="font-weight:700;font-size:13px;color:' + (p.requires_return ? "#8A6100" : "#1E7A3D") + ';">' + (p.requires_return ? "🔄 นำออกชั่วคราว · ต้องนำกลับ" : "✅ นำออกถาวร · ไม่ต้องนำกลับ") + '</span>' +
          (p.requires_return ? '<span style="font-size:12.5px;color:#8A6100;">กำหนดคืน: <strong>' + escapeHtml(p.due_date || "ยังไม่ระบุ") + '</strong></span>' : "") +
        '</div>' +
        '<div class="kv"><span class="k">ปลายทาง</span><span>' + escapeHtml(p.destination || "-") + '</span></div>' +
        '<div class="kv"><span class="k">ทะเบียนรถ</span><span>' + escapeHtml(p.vehicle_plate || "-") + '</span></div>' +
        '<div class="kv"><span class="k">มูลค่าสินค้า (โดยประมาณ)</span><span>' + fmtMoney(p.item_value, p.item_value_currency) + '</span></div>' +
        (p.note ? '<div class="kv"><span class="k">หมายเหตุ</span><span>' + escapeHtml(p.note) + '</span></div>' : "") +
        (p.return_notice_date ? '<div class="kv"><span class="k">แจ้งนำกลับ</span><span>' + escapeHtml(p.return_notice_date) + ' ' + escapeHtml(p.return_notice_time || "") + '</span></div>' : "") +
      '</div>' +

      '<div class="detailSection">' +
        '<h4>ผู้อนุมัติ</h4>' +
        '<div class="kv"><span class="k">ขั้น 1</span><span>' + (p.l1_approved_at ? 'อนุมัติโดย/Approved by ' + escapeHtml(p.approver_l1_name) + ' · ' + fmtDateTime(p.l1_approved_at) : escapeHtml(p.approver_l1_name) + ' (รอดำเนินการ)') + '</span></div>' +
        '<div class="kv"><span class="k">ขั้น 2</span><span>' + (p.l2_approved_at ? 'อนุมัติโดย/Approved by ' + escapeHtml(p.approver_l2_name) + ' · ' + fmtDateTime(p.l2_approved_at) : escapeHtml(p.approver_l2_name) + ' (รอดำเนินการ)') + '</span></div>' +
        (p.status === "rejected" ? '<div class="kv"><span class="k">เหตุผลปฏิเสธ</span><span>' + escapeHtml(p.rejected_reason || "-") + '</span></div>' : "") +
      '</div>' +

      (p.requires_return ? '<div class="detailSection">' +
        '<h4>การขอขยายเวลานำกลับ</h4>' +
        '<div class="kv"><span class="k">ใช้สิทธิ์ขยายเวลาแล้ว</span><span>' + (p.ext_count || 0) + ' / 3 ครั้ง</span></div>' +
        (p.ext_status ? '<div class="kv"><span class="k">สถานะคำขอล่าสุด</span><span>รออนุมัติ' + (p.ext_status === "pending_l1" ? " ขั้น 1" : " ขั้น 2") + ' — ขอเปลี่ยนเป็น ' + escapeHtml(p.ext_requested_due_date || "-") + '</span></div>' : "") +
      '</div>' : "") +

      '<div class="detailSection">' +
        '<h4>รายการของ (' + (p.items || []).length + ')</h4>' +
        itemsHtml +
      '</div>' +

      (securityPhotosHtml ? '<div class="detailSection"><h4>ภาพยืนยันความปลอดภัย</h4>' + securityPhotosHtml + '</div>' : "") +

      (actionsHtml ? '<div class="detailSection">' + actionsHtml + '</div>' : "") +
    '</div>' +
  '</div>';
  document.getElementById("modalRoot").innerHTML = modalHtml;
  window._activePassId = p.id;
}

function actionButtons(passId, stage) {
  return '<div class="field"><label>เหตุผล (กรณีปฏิเสธ)</label><input type="text" id="rejectReason_' + stage + '" placeholder="ระบุเหตุผล..."></div>' +
  '<div class="formActions">' +
    '<button class="btnSuccess" onclick="approvePass(\'' + passId + '\',\'' + stage + '\')">✔ อนุมัติ / Approve</button>' +
    '<button class="btnDanger" onclick="rejectPass(\'' + passId + '\',\'' + stage + '\')">✕ ปฏิเสธ / Reject</button>' +
  '</div>';
}

function extensionApprovalPanel(p, stage) {
  return '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px;">' +
    '<div style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px;">คำขอขยายเวลานำกลับ ครั้งที่ ' + ((p.ext_count || 0) + 1) + ' — ' + (stage === "l1" ? "รออนุมัติขั้น 1" : "รออนุมัติขั้น 2") + '</div>' +
    '<div class="kv"><span class="k">วันที่กำหนดเดิม</span><span>' + escapeHtml(p.due_date || "-") + '</span></div>' +
    '<div class="kv"><span class="k">วันที่ขอเปลี่ยนเป็น</span><span>' + escapeHtml(p.ext_requested_due_date || "-") + '</span></div>' +
    '<div class="kv"><span class="k">เหตุผล</span><span>' + escapeHtml(p.ext_reason || "-") + '</span></div>' +
  '</div>' +
  '<div class="field"><label>เหตุผล (กรณีปฏิเสธ)</label><input type="text" id="extRejectReason_' + stage + '" placeholder="ระบุเหตุผล..."></div>' +
  '<div class="formActions">' +
    '<button class="btnSuccess" onclick="approveExtension(\'' + p.id + '\',\'' + stage + '\')">✔ อนุมัติการขยายเวลา</button>' +
    '<button class="btnDanger" onclick="rejectExtension(\'' + p.id + '\',\'' + stage + '\')">✕ ปฏิเสธ</button>' +
  '</div>';
}

async function cancelRequest(id) {
  const p = allPasses.find(x => x.id === id);
  if (!confirm("ยืนยันยกเลิกคำขอนี้? การยกเลิกไม่สามารถย้อนกลับได้")) return;
  try {
    await db.collection("passes").doc(id).update({
      status: "cancelled",
      cancelled_by: currentProfile.email,
      cancelled_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ยกเลิกคำขอแล้ว", "ok");
    closeModal();
    if (p) {
      const recipients = [];
      if (p.approver_l1_email) recipients.push({ email: p.approver_l1_email, name: p.approver_l1_name });
      if (p.approver_l2_email && p.approver_l2_email !== p.approver_l1_email) recipients.push({ email: p.approver_l2_email, name: p.approver_l2_name });
      recipients.forEach(r => {
        sendNotifyEmail(
          r.email, r.name,
          biSubject("คำขอถูกยกเลิกโดยผู้ขอ", "Request cancelled by requester") + " - " + p.pass_no,
          biMessage(
            p.requester_name + " ยกเลิกคำขอนำของออก " + p.pass_no + " แล้ว ไม่ต้องดำเนินการอนุมัติต่อ",
            p.requester_name + " has cancelled removal request " + p.pass_no + ". No further approval action is needed."
          ),
          p.pass_no
        );
      });
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function submitExtensionRequest(id) {
  const dateEl = document.getElementById("extNewDate");
  const reasonEl = document.getElementById("extReason");
  const newDate = dateEl ? dateEl.value : "";
  const reason = reasonEl ? reasonEl.value.trim() : "";
  if (!newDate) return showToast("กรุณาระบุวันที่กำหนดคืนใหม่ที่ต้องการ", "err");
  if (!reason) return showToast("กรุณาระบุเหตุผลที่ขอขยายเวลา", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      ext_status: "pending_l1",
      ext_requested_due_date: newDate,
      ext_reason: reason,
      ext_requested_by: currentProfile.email,
      ext_requested_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ส่งคำขอขยายเวลาแล้ว รอผู้อนุมัติขั้น 1", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.approver_l1_email, p.approver_l1_name,
        biSubject("มีคำขอขยายเวลานำของกลับ", "Return-date extension request submitted") + " - " + p.pass_no,
        biMessage(
          p.requester_name + " ขอขยายเวลานำของกลับ (ครั้งที่ " + ((p.ext_count || 0) + 1) + ") เป็นวันที่ " + newDate + " เหตุผล: " + reason,
          p.requester_name + " has requested to extend the return date (attempt #" + ((p.ext_count || 0) + 1) + ") to " + newDate + ". Reason: " + reason
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function approveExtension(id, stage) {
  const p = allPasses.find(x => x.id === id);
  try {
    if (stage === "l1") {
      await db.collection("passes").doc(id).update({
        ext_status: "pending_l2",
        ext_l1_approved_at: firebase.firestore.FieldValue.serverTimestamp(),
        ext_l1_approved_by: currentProfile.email,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast("อนุมัติขั้น 1 แล้ว รอผู้อนุมัติขั้น 2", "ok");
      if (p) {
        sendNotifyEmail(
          p.approver_l2_email, p.approver_l2_name,
          biSubject("รออนุมัติคำขอขยายเวลา ขั้น 2", "Extension request awaiting Level 2 approval") + " - " + p.pass_no,
          biMessage(
            p.requester_name + " ขอขยายเวลานำของกลับ เป็นวันที่ " + p.ext_requested_due_date + " รอการอนุมัติขั้นที่ 2 จากท่าน",
            p.requester_name + " has requested to extend the return date to " + p.ext_requested_due_date + ". It is now awaiting your Level 2 approval."
          ),
          p.pass_no
        );
        sendNotifyEmail(
          p.requester_email, p.requester_name,
          biSubject("คำขอขยายเวลาผ่านขั้น 1 แล้ว", "Extension request passed Level 1") + " - " + p.pass_no,
          biMessage(
            "คำขอขยายเวลานำของกลับผ่านการอนุมัติขั้นที่ 1 แล้ว กำลังรออนุมัติขั้นที่ 2",
            "Your return-date extension request has passed Level 1 approval and is now awaiting Level 2 approval."
          ),
          p.pass_no
        );
      }
    } else {
      const newCount = (p ? (p.ext_count || 0) : 0) + 1;
      await db.collection("passes").doc(id).update({
        due_date: p.ext_requested_due_date,
        ext_status: null,
        ext_count: newCount,
        ext_l2_approved_at: firebase.firestore.FieldValue.serverTimestamp(),
        ext_l2_approved_by: currentProfile.email,
        ext_requested_due_date: null,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast("อนุมัติการขยายเวลาสำเร็จ (ครั้งที่ " + newCount + "/3)", "ok");
      if (p) {
        sendNotifyEmail(
          p.requester_email, p.requester_name,
          biSubject("ขยายเวลานำของกลับสำเร็จ", "Return-date extension approved") + " - " + p.pass_no,
          biMessage(
            "คำขอขยายเวลานำของกลับได้รับอนุมัติครบแล้ว วันที่กำหนดคืนใหม่: " + p.ext_requested_due_date + " (ใช้สิทธิ์ขยายเวลาไปแล้ว " + newCount + "/3 ครั้ง)",
            "Your return-date extension request has been fully approved. New due date: " + p.ext_requested_due_date + " (extension used " + newCount + "/3 times)."
          ),
          p.pass_no
        );
      }
    }
    closeModal();
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectExtension(id, stage) {
  const reason = document.getElementById("extRejectReason_" + stage).value.trim();
  if (!reason) return showToast("กรุณาระบุเหตุผลในการปฏิเสธ", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      ext_status: null,
      ext_requested_due_date: null,
      ext_last_rejected_reason: reason,
      ext_last_rejected_stage: stage,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ปฏิเสธคำขอขยายเวลาแล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("คำขอขยายเวลาถูกปฏิเสธ", "Extension request rejected") + " - " + p.pass_no,
        biMessage(
          "คำขอขยายเวลานำของกลับถูกปฏิเสธ เหตุผล: " + reason + " (วันที่กำหนดคืนเดิมยังคงอยู่: " + p.due_date + ")",
          "Your return-date extension request was rejected. Reason: " + reason + " (the original due date remains: " + p.due_date + ")."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

function closeModal() { document.getElementById("modalRoot").innerHTML = ""; window._activePassId = null; }

async function approvePass(id, stage) {
  const p = allPasses.find(x => x.id === id);
  try {
    const update = { updated_at: firebase.firestore.FieldValue.serverTimestamp() };
    if (stage === "l1") {
      update.status = "pending_l2";
      update.l1_approved_at = firebase.firestore.FieldValue.serverTimestamp();
      update.l1_approved_by = currentProfile.email;
    } else {
      update.status = "approved";
      update.l2_approved_at = firebase.firestore.FieldValue.serverTimestamp();
      update.l2_approved_by = currentProfile.email;
    }
    await db.collection("passes").doc(id).update(update);
    showToast("อนุมัติสำเร็จ", "ok");
    closeModal();
    if (p) {
      if (stage === "l1") {
        sendNotifyEmail(
          p.approver_l2_email, p.approver_l2_name,
          biSubject("รออนุมัติขั้น 2", "Awaiting your Level 2 approval") + " - " + p.pass_no,
          biMessage(
            p.requester_name + " (" + deptNameById(p.requester_dept) + ") รอการอนุมัติขั้นที่ 2 จากท่าน กรุณาเข้าระบบเพื่อตรวจสอบ",
            p.requester_name + " (" + deptNameById(p.requester_dept) + ") is awaiting your Level 2 approval. Please log in to review."
          ),
          p.pass_no
        );
        sendNotifyEmail(
          p.requester_email, p.requester_name,
          biSubject("คำขอผ่านอนุมัติขั้น 1 แล้ว", "Request passed Level 1 approval") + " - " + p.pass_no,
          biMessage(
            "คำขอนำของออกของคุณผ่านการอนุมัติขั้นที่ 1 แล้ว กำลังรออนุมัติขั้นที่ 2 จาก " + p.approver_l2_name,
            "Your removal request has passed Level 1 approval and is now awaiting Level 2 approval from " + p.approver_l2_name + "."
          ),
          p.pass_no
        );
      } else {
        sendNotifyEmail(
          p.requester_email, p.requester_name,
          biSubject("คำขอได้รับอนุมัติครบแล้ว", "Request fully approved") + " - " + p.pass_no,
          biMessage(
            "คำขอนำของออกของคุณได้รับอนุมัติครบทุกขั้นแล้ว พร้อมนำออกได้ (รอ รปภ. ตรวจของก่อนออกจากโรงงาน)",
            "Your removal request has been fully approved at both levels and is ready for removal (pending Security inspection at the gate)."
          ),
          p.pass_no
        );
      }
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectPass(id, stage) {
  const reason = document.getElementById("rejectReason_" + stage).value.trim();
  if (!reason) return showToast("กรุณาระบุเหตุผลในการปฏิเสธ", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "rejected",
      rejected_reason: reason,
      rejected_by: currentProfile.email,
      rejected_stage: stage,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ปฏิเสธคำขอแล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("คำขอถูกปฏิเสธ", "Request rejected") + " - " + p.pass_no,
        biMessage(
          "คำขอนำของออกของคุณถูกปฏิเสธ เหตุผล: " + reason,
          "Your removal request has been rejected. Reason: " + reason
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

let _secOutPhotoUrl = "", _returnPhotoUrl = "", _selfCheckPhotoUrl = "";

async function onSecurityPhoto(file) {
  if (!file) return;
  document.getElementById("secOutPreview").innerHTML = '<div class="icon">⏳</div><div class="lbl">กำลังอัปโหลด...</div>';
  try {
    _secOutPhotoUrl = await uploadToCloudinary(file);
    document.getElementById("secOutPreview").innerHTML = '<img src="' + _secOutPhotoUrl + '">';
  } catch (e) {
    showToast("อัปโหลดรูปไม่สำเร็จ", "err");
    document.getElementById("secOutPreview").innerHTML = '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>';
  }
}

async function confirmSecurityOut(id) {
  if (!_secOutPhotoUrl) return showToast("กรุณาถ่ายรูปยืนยันก่อน", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "issued",
      security_out_photo_url: _secOutPhotoUrl,
      security_out_by: currentProfile.email,
      security_out_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ยืนยันตรวจของและออกแล้ว", "ok");
    _secOutPhotoUrl = "";
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("ของออกจากโรงงานแล้ว", "Items have left the plant") + " - " + p.pass_no,
        biMessage(
          "รปภ. ตรวจของและอนุญาตให้นำของออกจากโรงงานเรียบร้อยแล้ว" + (p.requires_return ? " อย่าลืมแจ้งนำของกลับในระบบเมื่อถึงกำหนด" : ""),
          "Security has inspected and approved the removal of your items from the plant." + (p.requires_return ? " Remember to notify the system when you bring the items back." : "")
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectSecurityOut(id) {
  const reason = getReasonValue("secOutReject");
  if (!reason) return;
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "rejected",
      rejected_reason: reason,
      rejected_by: currentProfile.email,
      rejected_stage: "security_out",
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ปฏิเสธการนำของออกแล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("รปภ. ไม่อนุญาตให้นำของออก", "Security did not approve the removal") + " - " + p.pass_no,
        biMessage(
          "รปภ. ตรวจสอบของที่หน้าประตูแล้วไม่อนุญาตให้นำออกจากโรงงาน เหตุผล: " + reason + " กรุณาติดต่อ รปภ. หรือสร้างคำขอใหม่หากต้องการดำเนินการต่อ",
          "Security inspected the items at the gate and did not approve their removal. Reason: " + reason + " Please contact Security or submit a new request if you wish to proceed."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function submitReturnNotice(id) {
  const dateEl = document.getElementById("retNoticeDate");
  const timeEl = document.getElementById("retNoticeTime");
  const date = dateEl ? dateEl.value : "";
  const time = timeEl ? timeEl.value : "";
  if (!date || !time) return showToast("กรุณาระบุวันที่และเวลาที่จะนำของกลับ", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_requester",
      return_notice_date: date,
      return_notice_time: time,
      return_notice_by: currentProfile.email,
      return_notice_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("แจ้งนำของกลับสำเร็จ เมื่อของถึงแล้วกลับมาตรวจสอบ+แนบรูปในระบบอีกครั้ง", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("แจ้งนำของกลับสำเร็จ", "Return notice submitted") + " - " + p.pass_no,
        biMessage(
          "แจ้งนำของกลับวันที่ " + date + " เวลาประมาณ " + time + " เรียบร้อย เมื่อของถึงโรงงานแล้ว กรุณากลับเข้าระบบเพื่อตรวจสอบของและแนบรูปยืนยันก่อนส่งต่อให้ รปภ./Safety ตรวจสอบ",
          "Your return notice for " + date + " at approximately " + time + " has been submitted. Once the items arrive, please log back in to inspect them and attach a confirmation photo before handing off to Security/Safety."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function onSelfCheckPhoto(file) {
  if (!file) return;
  document.getElementById("selfCheckPreview").innerHTML = '<div class="icon">⏳</div><div class="lbl">กำลังอัปโหลด...</div>';
  try {
    _selfCheckPhotoUrl = await uploadToCloudinary(file);
    document.getElementById("selfCheckPreview").innerHTML = '<img src="' + _selfCheckPhotoUrl + '">';
  } catch (e) {
    showToast("อัปโหลดรูปไม่สำเร็จ", "err");
    document.getElementById("selfCheckPreview").innerHTML = '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>';
  }
}

async function submitSelfCheckReturn(id) {
  if (!_selfCheckPhotoUrl) return showToast("กรุณาถ่ายรูปยืนยันก่อน", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_security",
      requester_check_photo_url: _selfCheckPhotoUrl,
      requester_check_by: currentProfile.email,
      requester_check_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ยืนยันตรวจสอบของนำเข้าแล้ว ส่งต่อให้ รปภ./Safety ตรวจสอบ", "ok");
    _selfCheckPhotoUrl = "";
    closeModal();
    if (p) {
      RETURN_NOTICE_RECIPIENTS.forEach(r => {
        sendNotifyEmail(
          r.email, r.name,
          biSubject("โปรดตรวจของที่นำกลับ", "Please inspect returned items") + " - " + p.pass_no,
          biMessage(
            p.requester_name + " (" + deptNameById(p.requester_dept) + ") ตรวจสอบของที่นำเข้าเบื้องต้นแล้ว กรุณาตรวจของและถ่ายรูปยืนยันในระบบ (Tab \"Security Check\")",
            p.requester_name + " (" + deptNameById(p.requester_dept) + ") has completed the initial inspection of the returned items. Please inspect them and attach a confirmation photo in the system (\"Security Check\" tab)."
          ),
          p.pass_no
        );
      });
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function onReturnPhoto(file) {
  if (!file) return;
  document.getElementById("secRetPreview").innerHTML = '<div class="icon">⏳</div><div class="lbl">กำลังอัปโหลด...</div>';
  try {
    _returnPhotoUrl = await uploadToCloudinary(file);
    document.getElementById("secRetPreview").innerHTML = '<img src="' + _returnPhotoUrl + '">';
  } catch (e) {
    showToast("อัปโหลดรูปไม่สำเร็จ", "err");
    document.getElementById("secRetPreview").innerHTML = '<div class="icon">📷</div><div class="lbl">ถ่ายรูปยืนยัน</div>';
  }
}

async function confirmReturn(id) {
  if (!_returnPhotoUrl) return showToast("กรุณาถ่ายรูปยืนยันก่อน", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_l1",
      return_photo_url: _returnPhotoUrl,
      return_by: currentProfile.email,
      return_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ยืนยันตรวจของแล้ว ส่งต่อให้ผจก.แผนกรับทราบและปิดคำขอ", "ok");
    _returnPhotoUrl = "";
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.approver_l1_email, p.approver_l1_name,
        biSubject("รอรับทราบและอนุมัติปิดคำขอ", "Awaiting acknowledgement to close the request") + " - " + p.pass_no,
        biMessage(
          "รปภ./Safety ตรวจสอบของที่นำกลับของ " + p.requester_name + " เรียบร้อยแล้ว กรุณาเข้าระบบเพื่อรับทราบและอนุมัติปิดคำขอ",
          "Security/Safety has completed inspection of the returned items for " + p.requester_name + ". Please log in to acknowledge and approve closing the request."
        ),
        p.pass_no
      );
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("ผ่านการตรวจของแล้ว", "Item inspection completed") + " - " + p.pass_no,
        biMessage(
          "รปภ./Safety ตรวจสอบของที่นำกลับเรียบร้อยแล้ว อยู่ระหว่างรอผจก.แผนกและ Safety Department Head อนุมัติปิดคำขอ",
          "Security/Safety has completed inspection of the returned items. The request is now awaiting closing approval from the Department Manager and Safety Department Head."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function approveReturnL1(id) {
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_ehs",
      return_l1_approved_by: currentProfile.email,
      return_l1_approved_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("รับทราบแล้ว ส่งต่อให้ Safety Department Head ปิดคำขอ", "ok");
    closeModal();
    if (p) {
      const ehsMgr = DEPARTMENTS.find(d => d.id === "ehs");
      sendNotifyEmail(
        ehsMgr.l1_email, ehsMgr.l1_name,
        biSubject("รอปิดคำขอ (ขั้นตอนสุดท้าย)", "Awaiting final closing approval") + " - " + p.pass_no,
        biMessage(
          "คำขอนำของกลับของ " + p.requester_name + " ผ่านการรับทราบจาก " + p.approver_l1_name + " แล้ว รอท่านอนุมัติปิดคำขอเป็นขั้นตอนสุดท้าย",
          "The return request for " + p.requester_name + " has been acknowledged by " + p.approver_l1_name + ". Please approve closing the request as the final step."
        ),
        p.pass_no
      );
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("ใกล้ปิดคำขอแล้ว", "Request is almost closed") + " - " + p.pass_no,
        biMessage(
          "คำขอนำของกลับผ่านการรับทราบจากผจก.แผนกแล้ว รอ Safety Department Head อนุมัติปิดคำขอขั้นตอนสุดท้าย",
          "Your return request has been acknowledged by the Department Manager and is now awaiting final closing approval from the Safety Department Head."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectReturnL1(id) {
  const reasonEl = document.getElementById("rejReturnL1Reason");
  const reason = reasonEl ? reasonEl.value.trim() : "";
  if (!reason) return showToast("กรุณาระบุเหตุผล", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_security",
      return_l1_reject_reason: reason,
      return_l1_reject_by: currentProfile.email,
      return_l1_reject_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ส่งกลับให้ รปภ./Safety ตรวจสอบใหม่แล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("คำขอถูกส่งกลับให้ตรวจสอบใหม่", "Request sent back for re-inspection") + " - " + p.pass_no,
        biMessage(
          "ผจก.แผนกส่งคำขอกลับให้ รปภ./Safety ตรวจสอบใหม่ เหตุผล: " + reason,
          "The Department Manager sent this request back to Security/Safety for re-inspection. Reason: " + reason
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function approveReturnEhs(id) {
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "returned",
      return_closed_by: currentProfile.email,
      return_closed_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ปิดคำขอสมบูรณ์", "ok");
    closeModal();
    if (p) {
      const closingRecipients = [
        { email: p.requester_email, name: p.requester_name },
        { email: p.approver_l1_email, name: p.approver_l1_name },
        ...EHS_GROUP
      ];
      const seen = {};
      closingRecipients.forEach(r => {
        if (!r.email || seen[r.email.toLowerCase()]) return;
        seen[r.email.toLowerCase()] = true;
        sendNotifyEmail(
          r.email, r.name,
          biSubject("ปิดคำขอสมบูรณ์", "Request closed successfully") + " - " + p.pass_no,
          biMessage(
            "ของนำเข้าเรียบร้อย ตรวจสอบครบทุกขั้นตอนแล้ว ปิดใบคำขอ " + p.pass_no + " เรียบร้อย",
            "Items have been returned and verified at every step. Request " + p.pass_no + " is now closed."
          ),
          p.pass_no
        );
      });
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectReturnEhs(id) {
  const reasonEl = document.getElementById("rejReturnEhsReason");
  const reason = reasonEl ? reasonEl.value.trim() : "";
  if (!reason) return showToast("กรุณาระบุเหตุผล", "err");
  const p = allPasses.find(x => x.id === id);
  try {
    await db.collection("passes").doc(id).update({
      status: "return_pending_l1",
      return_ehs_reject_reason: reason,
      return_ehs_reject_by: currentProfile.email,
      return_ehs_reject_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("ส่งกลับให้ผจก.แผนกพิจารณาใหม่แล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.approver_l1_email, p.approver_l1_name,
        biSubject("คำขอถูกส่งกลับให้พิจารณาใหม่", "Request sent back for reconsideration") + " - " + p.pass_no,
        biMessage(
          "Safety Department Head ส่งคำขอกลับให้พิจารณาใหม่ เหตุผล: " + reason,
          "The Safety Department Head sent this request back for reconsideration. Reason: " + reason
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function rejectReturnCheck(id) {
  const reason = getReasonValue("retReject");
  if (!reason) return;
  const p = allPasses.find(x => x.id === id);
  try {
    // Stays in "return_pending_security" — goods were legitimately issued, only the return itself has a problem
    // that needs the requester's follow-up, so we keep it visible/actionable rather than closing the case.
    await db.collection("passes").doc(id).update({
      return_last_reject_reason: reason,
      return_last_reject_by: currentProfile.email,
      return_last_reject_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("บันทึกการปฏิเสธการรับคืนแล้ว", "ok");
    closeModal();
    if (p) {
      sendNotifyEmail(
        p.requester_email, p.requester_name,
        biSubject("การนำของกลับมีปัญหา โปรดตรวจสอบ", "Issue found with returned items — please review") + " - " + p.pass_no,
        biMessage(
          "รปภ./Safety ตรวจของที่นำกลับแล้วพบปัญหา ไม่สามารถยืนยันรับคืนได้ เหตุผล: " + reason + " กรุณาตรวจสอบและแจ้งนำของกลับใหม่อีกครั้งเมื่อพร้อม",
          "Security/Safety inspected the returned items and found an issue, so the return could not be confirmed. Reason: " + reason + " Please review and submit a new return notice once ready."
        ),
        p.pass_no
      );
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

const RETURN_PIPELINE_STATUSES = ["return_pending_requester", "return_pending_security", "return_pending_l1", "return_pending_ehs"];

function renderTrackingView() {
  const el = document.getElementById("view-tracking");
  let list = getVisiblePasses(allPasses).filter(p => p.requires_return && (p.status === "issued" || RETURN_PIPELINE_STATUSES.includes(p.status)));
  const overdue = list.filter(isOverdue);
  const notNotified = list.filter(p => p.status === "issued" && !isOverdue(p));
  const closingInProgress = list.filter(p => RETURN_PIPELINE_STATUSES.includes(p.status));
  const returnedCount = getVisiblePasses(allPasses).filter(p => p.requires_return && p.status === "returned").length;

  let html = '<div class="trackStats" style="grid-template-columns:repeat(4,1fr);">' +
    '<div class="statCard danger"><div class="num">' + overdue.length + '</div><div class="lbl">Overdue</div></div>' +
    '<div class="statCard warn"><div class="num">' + notNotified.length + '</div><div class="lbl">ยังไม่แจ้งคืน</div></div>' +
    '<div class="statCard"><div class="num">' + closingInProgress.length + '</div><div class="lbl">กำลังปิดคำขอ</div></div>' +
    '<div class="statCard"><div class="num" style="color:var(--success)">' + returnedCount + '</div><div class="lbl">คืนแล้ว</div></div>' +
    '</div>';

  if (list.length === 0) {
    html += '<div class="emptyState">ไม่มีของที่ต้องนำกลับ / Nothing pending return</div>';
  } else {
    list.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
    list.forEach(p => { html += passCardHtml(p); });
  }
  el.innerHTML = html;
}

function renderDashboardView() {
  const el = document.getElementById("view-dashboard");
  let list = allPasses;
  if (currentProfile.dashboard === "own_dept") {
    const depts = visibleDeptIdsForCurrentUser();
    list = list.filter(p => depts.includes(p.requester_dept));
  }

  const total = list.length;
  const pendingApproval = list.filter(p => p.status === "pending_l1" || p.status === "pending_l2").length;
  const issued = list.filter(p => p.status === "issued").length;
  const overdueCount = list.filter(isOverdue).length;

  const statusOrder = ["pending_l1", "pending_l2", "approved", "issued", "return_pending_requester", "return_pending_security", "return_pending_l1", "return_pending_ehs", "returned", "rejected", "cancelled"];
  const statusColors = { pending_l1: "#E2A400", pending_l2: "#E07A1F", approved: "#2F6FED", issued: "#1F497D", return_pending_requester: "#B45309", return_pending_security: "#7C5CE0", return_pending_l1: "#0369A1", return_pending_ehs: "#15803D", returned: "#2E8B57", rejected: "#D64545", cancelled: "#6B7280" };
  const statusCounts = {};
  statusOrder.forEach(s => statusCounts[s] = list.filter(p => p.status === s).length);
  const maxStatus = Math.max(1, Math.max.apply(null, Object.values(statusCounts)));

  const deptCounts = {};
  DEPARTMENTS.forEach(d => deptCounts[d.id] = 0);
  list.forEach(p => { if (deptCounts[p.requester_dept] !== undefined) deptCounts[p.requester_dept]++; });
  const maxDept = Math.max(1, Math.max.apply(null, Object.values(deptCounts)));

  el.innerHTML =
    '<div class="statGrid">' +
      '<div class="statCard"><div class="num">' + total + '</div><div class="lbl">ทั้งหมด</div></div>' +
      '<div class="statCard warn"><div class="num">' + pendingApproval + '</div><div class="lbl">รออนุมัติ</div></div>' +
      '<div class="statCard"><div class="num">' + issued + '</div><div class="lbl">ออกแล้ว</div></div>' +
      '<div class="statCard danger"><div class="num">' + overdueCount + '</div><div class="lbl">Overdue</div></div>' +
    '</div>' +
    '<div class="dashRow">' +
      '<div class="formCard">' +
        '<h3 style="margin-top:0;">ตามสถานะ</h3>' +
        statusOrder.map(s => '<div class="barRow"><span class="lbl">' + STATUS_LABEL[s] + '</span><div class="barTrack"><div class="barFill" style="width:' + (statusCounts[s] / maxStatus * 100) + '%;background:' + statusColors[s] + ';"></div></div><span class="barNum">' + statusCounts[s] + '</span></div>').join("") +
      '</div>' +
      '<div class="formCard">' +
        '<h3 style="margin-top:0;">ตามแผนก</h3>' +
        DEPARTMENTS.map(d => '<div class="barRow"><span class="lbl">' + d.name_th + '</span><div class="barTrack"><div class="barFill" style="width:' + (deptCounts[d.id] / maxDept * 100) + '%;"></div></div><span class="barNum">' + deptCounts[d.id] + '</span></div>').join("") +
      '</div>' +
    '</div>' +
    '<div style="margin-top:14px;text-align:right;"><button class="btnGhost" onclick="exportCsv()">⬇ Export CSV</button></div>';
}

function exportCsv() {
  let list = allPasses;
  if (currentProfile.dashboard === "own_dept") {
    const depts = visibleDeptIdsForCurrentUser();
    list = list.filter(p => depts.includes(p.requester_dept));
  }
  const headers = ["Pass No", "Requester", "Department", "Purpose", "Status", "Due Date", "Created At"];
  const rows = list.map(p => [
    p.pass_no, p.requester_name, deptNameById(p.requester_dept), p.purpose_en, STATUS_LABEL[p.status] || p.status, p.due_date || "", fmtDate(p.created_at)
  ]);
  let csv = headers.join(",") + "\n" + rows.map(r => r.map(v => '"' + String(v || "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "property_removal_export_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

let l2ApproverDraftRows = []; // temp unsaved new-row placeholders, [{tempId, name, email}]

function renderAdminView() {
  const el = document.getElementById("view-admin");
  el.innerHTML =
    '<div class="formCard">' +
      '<h3 style="margin-top:0;">ผู้อนุมัติขั้น 1 ตามแผนก</h3>' +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:-6px;">แก้ไขชื่อ/Email แล้วกด Save ต่อแถว — มีผลทันทีตั้งแต่ Login ครั้งถัดไปของบุคคลนั้น ไม่ต้องแก้ Code</p>' +
      DEPARTMENTS.map(d => deptApproverRowHtml(d)).join("") +
    '</div>' +
    '<div class="formCard">' +
      '<h3 style="margin-top:0;">ผู้อนุมัติขั้น 2</h3>' +
      '<p style="font-size:12.5px;color:var(--muted);margin-top:-6px;">รายชื่อที่ผู้ขอเลือกได้ตอนสร้างคำขอ — เพิ่ม/แก้ไข/ลบได้อิสระ</p>' +
      '<div id="l2ApproverList">' + L2_APPROVERS.map(a => l2ApproverRowHtml(a.email, a.name, a.email, false)).join("") + '</div>' +
      '<div id="l2ApproverDrafts">' + l2ApproverDraftRows.map(r => l2ApproverRowHtml(r.tempId, r.name, r.email, true)).join("") + '</div>' +
      '<button class="addItemBtn" onclick="addL2ApproverRow()">+ เพิ่มผู้อนุมัติขั้น 2</button>' +
    '</div>' +
    '<div class="formCard">' +
      '<h3 style="margin-top:0;">ข้อมูลอ้างอิงอื่นๆ (Read-only)</h3>' +
      '<p style="font-size:12.5px;color:var(--muted);">ประเภทการนำออก, หน่วยนับ, และรายชื่อแผนก กำหนดไว้ในตัวแอปโดยตรง หากต้องการเพิ่ม/ลดแผนก หรือประเภทการนำออก แจ้ง Developer เพื่อแก้ไขใน app.js</p>' +
    '</div>';
}

function deptApproverRowHtml(d) {
  const rowId = "dept_" + d.id;
  return '<div style="display:grid;grid-template-columns:1.2fr 1.3fr 1.6fr auto;gap:8px;align-items:end;padding:10px 0;border-bottom:1px solid var(--border);">' +
    '<div style="font-size:13px;font-weight:600;color:var(--navy);padding-bottom:9px;">' + escapeHtml(d.name_th) + '</div>' +
    '<div class="field" style="margin:0;"><label>ชื่อผู้อนุมัติ</label><input type="text" id="' + rowId + '_name" value="' + escapeHtml(d.l1_name) + '"></div>' +
    '<div class="field" style="margin:0;"><label>Email</label><input type="email" id="' + rowId + '_email" value="' + escapeHtml(d.l1_email) + '"></div>' +
    '<button class="btnGhost" style="padding:9px 14px;" onclick="saveDeptApprover(\'' + d.id + '\')">Save</button>' +
  '</div>';
}

function l2ApproverRowHtml(rowKey, name, email, isDraft) {
  const rowId = "l2_" + rowKey.replace(/[^a-zA-Z0-9]/g, "_");
  return '<div style="display:grid;grid-template-columns:1.3fr 1.6fr auto auto;gap:8px;align-items:end;padding:10px 0;border-bottom:1px solid var(--border);">' +
    '<div class="field" style="margin:0;"><label>ชื่อ</label><input type="text" id="' + rowId + '_name" value="' + escapeHtml(name || "") + '"></div>' +
    '<div class="field" style="margin:0;"><label>Email</label><input type="email" id="' + rowId + '_email" value="' + escapeHtml(email || "") + '" ' + (isDraft ? "" : "") + '></div>' +
    '<button class="btnGhost" style="padding:9px 14px;" onclick="saveL2Approver(\'' + rowKey + '\', ' + (isDraft ? "true" : "false") + ')">Save</button>' +
    '<button class="btnDanger" style="padding:9px 14px;" onclick="' + (isDraft ? "removeL2DraftRow('" + rowKey + "')" : "deleteL2Approver('" + rowKey + "')") + '">ลบ</button>' +
  '</div>';
}

function addL2ApproverRow() {
  l2ApproverDraftRows.push({ tempId: "draft_" + (++itemCounter), name: "", email: "" });
  renderAdminView();
}

function removeL2DraftRow(tempId) {
  l2ApproverDraftRows = l2ApproverDraftRows.filter(r => r.tempId !== tempId);
  renderAdminView();
}

async function saveDeptApprover(deptId) {
  const nameEl = document.getElementById("dept_" + deptId + "_name");
  const emailEl = document.getElementById("dept_" + deptId + "_email");
  const name = nameEl.value.trim();
  const email = emailEl.value.trim().toLowerCase();
  if (!name || !email) return showToast("กรุณากรอกชื่อและ Email ให้ครบ", "err");
  if (!email.includes("@")) return showToast("รูปแบบ Email ไม่ถูกต้อง", "err");
  try {
    await db.collection("departments").doc(deptId).set({ l1_name: name, l1_email: email }, { merge: true });
    const target = DEPARTMENTS.find(d => d.id === deptId);
    if (target) { target.l1_name = name; target.l1_email = email; }
    showToast("บันทึกผู้อนุมัติขั้น 1 ของแผนกนี้แล้ว", "ok");
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function saveL2Approver(rowKey, isDraft) {
  const rowId = "l2_" + rowKey.replace(/[^a-zA-Z0-9]/g, "_");
  const nameEl = document.getElementById(rowId + "_name");
  const emailEl = document.getElementById(rowId + "_email");
  const name = nameEl.value.trim();
  const email = emailEl.value.trim().toLowerCase();
  if (!name || !email) return showToast("กรุณากรอกชื่อและ Email ให้ครบ", "err");
  if (!email.includes("@")) return showToast("รูปแบบ Email ไม่ถูกต้อง", "err");
  const docId = email.replace(/[^a-zA-Z0-9]/g, "_");
  try {
    // if this save changes the email of an EXISTING (non-draft) row, remove the old doc first
    if (!isDraft && rowKey !== email) {
      const oldDocId = rowKey.replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("l2Approvers").doc(oldDocId).delete();
      L2_APPROVERS = L2_APPROVERS.filter(a => a.email !== rowKey);
    }
    await db.collection("l2Approvers").doc(docId).set({ name, email });
    const existing = L2_APPROVERS.find(a => a.email === email);
    if (existing) { existing.name = name; } else { L2_APPROVERS.push({ name, email }); }
    if (isDraft) l2ApproverDraftRows = l2ApproverDraftRows.filter(r => r.tempId !== rowKey);
    showToast("บันทึกผู้อนุมัติขั้น 2 แล้ว", "ok");
    renderAdminView();
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}

async function deleteL2Approver(email) {
  if (L2_APPROVERS.length <= 1) return showToast("ต้องมีผู้อนุมัติขั้น 2 อย่างน้อย 1 คน", "err");
  if (!confirm("ยืนยันลบผู้อนุมัติขั้น 2 คนนี้?")) return;
  const docId = email.replace(/[^a-zA-Z0-9]/g, "_");
  try {
    await db.collection("l2Approvers").doc(docId).delete();
    L2_APPROVERS = L2_APPROVERS.filter(a => a.email !== email);
    showToast("ลบแล้ว", "ok");
    renderAdminView();
  } catch (e) { showToast("เกิดข้อผิดพลาด: " + e.message, "err"); }
}
