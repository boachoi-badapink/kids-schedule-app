import { useState, useEffect, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "./firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ─── Utility helpers ───
const DAYS_KR = ["월", "화", "수", "목", "금", "토", "일"];
const DAYS_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7~21

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isSunday(d) {
  return d.getDay() === 0;
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function weekKey(monday) {
  return formatDate(monday);
}

function timeToMin(h, m) { return h * 60 + m; }
function minToTime(min) { return { h: Math.floor(min / 60), m: min % 60 }; }
function formatTime(h, m) { return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ─── Storage Keys ───
const STORAGE_KEYS = {
  schedules: "schedules",
  defaults: "defaults",
  journals: "journals",
  dailyJournals: "dailyJournals",
};

// ─── Firebase Storage helpers ───
let _currentUid = null;

function setCurrentUid(uid) { _currentUid = uid; }

async function cloudSave(key, data) {
  if (!_currentUid) return;
  try {
    await setDoc(doc(db, "users", _currentUid, "data", key), { value: JSON.stringify(data), updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Firebase save failed:", e);
  }
}

async function cloudLoad(key) {
  if (!_currentUid) return null;
  try {
    const snap = await getDoc(doc(db, "users", _currentUid, "data", key));
    if (snap.exists()) {
      return JSON.parse(snap.data().value);
    }
  } catch (e) {
    console.error("Firebase load failed:", e);
  }
  return null;
}

// Convert audio blob to base64 data URL (stored in Firestore directly)
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// ─── Icons (inline SVG) ───
function MicIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function TextIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ChevronLeft({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CalendarWeekIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="9" y1="10" x2="9" y2="22" />
      <line x1="15" y1="10" x2="15" y2="22" />
    </svg>
  );
}

function PlusIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PlayIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StopIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function PenIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function BookIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="13" y2="11" />
    </svg>
  );
}

function HomeIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SettingsIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ─── Schedule colors ───
const SCHEDULE_COLORS = [
  "#FF6B6B", "#FECA57", "#48DBFB", "#FF9FF3",
  "#54A0FF", "#5F27CD", "#01A3A4", "#F368E0",
  "#FF6348", "#2ED573", "#1E90FF", "#FFA502",
];

function getColor(index) {
  return SCHEDULE_COLORS[index % SCHEDULE_COLORS.length];
}

// ─── CSS ───
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Gaegu:wght@300;400;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

:root {
  --bg: #FFF8F0;
  --bg2: #FFF2E5;
  --card: #FFFFFF;
  --text: #2D3436;
  --text2: #636E72;
  --text3: #B2BEC3;
  --accent: #FF6B6B;
  --accent2: #FECA57;
  --accent3: #48DBFB;
  --border: #F0E6DA;
  --shadow: 0 2px 12px rgba(0,0,0,0.06);
  --shadow2: 0 4px 20px rgba(0,0,0,0.1);
  --radius: 16px;
  --radius-sm: 10px;
  --font-display: 'Gaegu', cursive;
  --font-body: 'Noto Sans KR', sans-serif;
  --header-h: 56px;
  --nav-h: 64px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #root {
  height: 100%;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.app {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg);
}

@media (min-width: 768px) {
  .app { max-width: 720px; }
}

/* Header */
.header {
  position: sticky; top: 0; z-index: 100;
  height: var(--header-h);
  background: var(--card);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
  backdrop-filter: blur(10px);
}
.header-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
}
.header-actions { display: flex; gap: 8px; align-items: center; }
.icon-btn {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: var(--bg2);
  border-radius: 12px; cursor: pointer;
  color: var(--text2);
  transition: all 0.2s;
}
.icon-btn:hover { background: var(--border); color: var(--text); }
.icon-btn.active { background: var(--accent); color: #fff; }

/* Bottom Nav */
.bottom-nav {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 480px;
  height: var(--nav-h);
  background: var(--card);
  border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-around;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
@media (min-width: 768px) {
  .bottom-nav { max-width: 720px; }
}
.nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  border: none; background: none; cursor: pointer;
  color: var(--text3); font-size: 11px; font-family: var(--font-body);
  transition: color 0.2s;
}
.nav-item.active { color: var(--accent); }
.nav-item span { font-weight: 500; }

/* Content area */
.content {
  flex: 1;
  padding: 12px 16px;
  padding-bottom: calc(var(--nav-h) + 16px);
  overflow-y: auto;
}

/* Day navigation */
.day-nav {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  margin-bottom: 16px;
}
.day-nav h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  min-width: 160px;
  text-align: center;
}
.day-nav button {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: var(--card);
  border-radius: 50%; cursor: pointer;
  box-shadow: var(--shadow);
  color: var(--text2);
  transition: all 0.2s;
}
.day-nav button:hover { background: var(--accent); color: #fff; }

/* Timetable */
.timetable {
  position: relative;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.timetable-grid {
  position: relative;
  margin-left: 48px;
}
.time-label {
  position: absolute;
  left: 0; width: 48px;
  font-size: 11px;
  color: var(--text3);
  text-align: right;
  padding-right: 8px;
  transform: translateY(-7px);
  font-weight: 500;
}
.hour-line {
  position: absolute;
  left: 48px; right: 0;
  height: 1px;
  background: var(--border);
}
.schedule-block {
  position: absolute;
  left: 4px; right: 4px;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.schedule-block:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow2);
  z-index: 3;
}
.schedule-block .block-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.schedule-block .block-time {
  font-size: 10px;
  color: rgba(255,255,255,0.85);
  margin-top: 1px;
}
.schedule-block .journal-icons {
  position: absolute;
  top: 4px;
  right: 6px;
  display: flex; gap: 3px;
}

/* Weekly timetable */
.week-timetable {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.week-grid {
  display: grid;
  grid-template-columns: 48px repeat(7, 1fr);
  min-width: 600px;
}
.week-header {
  text-align: center;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2);
  border-bottom: 2px solid var(--border);
  font-family: var(--font-display);
}
.week-header.today {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.week-col {
  position: relative;
  border-left: 1px solid var(--border);
  min-height: 60px;
}
.week-block {
  position: absolute;
  left: 2px; right: 2px;
  border-radius: 6px;
  padding: 2px 4px;
  overflow: hidden;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  line-height: 1.2;
  text-shadow: 0 1px 2px rgba(0,0,0,0.15);
  cursor: pointer;
  z-index: 2;
}

/* Modal / Overlay */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45);
  z-index: 200;
  display: flex; align-items: flex-end; justify-content: center;
  animation: fadeIn 0.2s;
}
.modal {
  width: 100%; max-width: 480px;
  background: var(--card);
  border-radius: 24px 24px 0 0;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px 20px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0));
  animation: slideUp 0.3s ease-out;
}
.modal-center {
  align-items: center;
}
.modal-center .modal {
  border-radius: var(--radius);
  max-width: 400px;
  margin: 0 16px;
  animation: popIn 0.25s ease-out;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.modal h3 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text);
}

/* Form elements */
.form-group { margin-bottom: 14px; }
.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  margin-bottom: 6px;
  display: block;
}
.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  transition: border-color 0.2s;
  outline: none;
}
.form-input:focus { border-color: var(--accent); }
.form-row { display: flex; gap: 10px; }
.form-row > * { flex: 1; }

.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 12px 24px;
  border: none; border-radius: var(--radius-sm);
  font-size: 15px; font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #e05555; }
.btn-secondary { background: var(--bg2); color: var(--text); }
.btn-secondary:hover { background: var(--border); }
.btn-block { width: 100%; }
.btn-sm { padding: 8px 16px; font-size: 13px; }
.btn-danger { background: #ff4757; color: #fff; }

/* Schedule list items for default setup */
.sched-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}
.sched-item .color-dot {
  width: 12px; height: 12px;
  border-radius: 50%; flex-shrink: 0;
}
.sched-item .sched-info { flex: 1; min-width: 0; }
.sched-item .sched-title { font-size: 14px; font-weight: 600; }
.sched-item .sched-meta { font-size: 11px; color: var(--text3); }
.sched-item .sched-actions { display: flex; gap: 4px; }
.sched-item .sched-actions button {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: var(--card);
  border-radius: 8px; cursor: pointer;
  color: var(--text3);
}
.sched-item .sched-actions button:hover { color: var(--accent); }

/* Journal */
.journal-section {
  margin-top: 16px;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
}
.journal-section h4 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 12px;
}
.journal-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  resize: vertical;
  outline: none;
}
.journal-textarea:focus { border-color: var(--accent); }

.record-type-btns {
  display: flex; gap: 8px; margin-bottom: 14px;
}
.record-type-btn {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
}
.record-type-btn.active {
  border-color: var(--accent);
  background: #FFF0F0;
  color: var(--accent);
}

.recording-area {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 20px;
}
.rec-btn {
  width: 64px; height: 64px;
  border-radius: 50%;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.rec-btn.start { background: var(--accent); color: #fff; }
.rec-btn.start:hover { background: #e05555; transform: scale(1.05); }
.rec-btn.stop { background: #ff4757; color: #fff; animation: pulse 1.5s infinite; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.4); }
  50% { box-shadow: 0 0 0 12px rgba(255,71,87,0); }
}
.rec-timer { font-family: var(--font-display); font-size: 28px; font-weight: 700; color: var(--accent); }

.audio-player {
  width: 100%;
  margin: 8px 0;
  border-radius: 8px;
}

/* Today's feeling button */
.today-feeling-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #FECA57, #FF6B6B);
  border: none;
  border-radius: var(--radius);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-display);
  cursor: pointer;
  box-shadow: var(--shadow);
  transition: transform 0.2s;
  margin-top: 12px;
}
.today-feeling-btn:hover { transform: translateY(-2px); }

/* Popup */
.popup-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn 0.2s;
}
.popup {
  background: var(--card);
  border-radius: var(--radius);
  padding: 28px 24px;
  max-width: 340px;
  width: calc(100% - 32px);
  text-align: center;
  animation: popIn 0.3s ease-out;
}
.popup h3 {
  font-family: var(--font-display);
  font-size: 24px;
  margin-bottom: 8px;
}
.popup p {
  color: var(--text2);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.6;
}
.popup-actions { display: flex; gap: 10px; justify-content: center; }

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text3);
}
.empty-state .emoji { font-size: 48px; margin-bottom: 12px; }
.empty-state p { font-size: 14px; line-height: 1.6; }

/* Journal entry view */
.journal-entry {
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 10px;
}
.journal-entry-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.journal-entry-type {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: var(--accent);
}
.journal-entry-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
}

/* Drag to create */
.drag-selection {
  position: absolute;
  left: 4px; right: 4px;
  background: rgba(255, 107, 107, 0.2);
  border: 2px dashed var(--accent);
  border-radius: var(--radius-sm);
  z-index: 5;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  transition: height 0.05s;
}
.week-drag-selection {
  position: absolute;
  left: 2px; right: 2px;
  background: rgba(255, 107, 107, 0.2);
  border: 2px dashed var(--accent);
  border-radius: 6px;
  z-index: 5;
  pointer-events: none;
  font-size: 9px;
  font-weight: 600;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.timetable-grid { user-select: none; -webkit-user-select: none; }
.week-col { user-select: none; -webkit-user-select: none; }

/* Day summary card */
.day-summary {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 16px;
  margin-bottom: 14px;
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.day-summary-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  background: var(--bg);
}
.day-summary-stat .stat-value {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}
.day-summary-stat .stat-label {
  font-size: 11px;
  color: var(--text3);
  font-weight: 500;
}
.day-summary-next {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 12px 16px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.day-summary-next .next-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: blink 1.5s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.day-summary-next .next-info {
  flex: 1;
  min-width: 0;
}
.day-summary-next .next-label {
  font-size: 11px;
  color: var(--text3);
  font-weight: 500;
}
.day-summary-next .next-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.day-summary-next .next-time {
  font-size: 12px;
  color: var(--text2);
  font-family: var(--font-display);
  font-weight: 700;
  white-space: nowrap;
}

/* Login screen */
.login-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 20px;
}
.login-card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow2);
  padding: 40px 32px;
  max-width: 360px;
  width: 100%;
  text-align: center;
}
.login-card .login-emoji { font-size: 56px; margin-bottom: 16px; }
.login-card h1 {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
}
.login-card p {
  font-size: 14px;
  color: var(--text2);
  line-height: 1.6;
  margin-bottom: 28px;
}
.google-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px 24px;
  background: #fff;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  color: var(--text);
  cursor: pointer;
  transition: all 0.2s;
}
.google-btn:hover { border-color: var(--accent); background: #FFF5F5; }
.google-btn svg { flex-shrink: 0; }

/* User profile in header */
.user-profile {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border);
}
.user-menu {
  position: absolute;
  top: calc(var(--header-h) - 4px);
  right: 16px;
  background: var(--card);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow2);
  padding: 8px 0;
  min-width: 160px;
  z-index: 150;
  animation: popIn 0.15s ease-out;
}
.user-menu-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  font-family: var(--font-body);
  color: var(--text);
  cursor: pointer;
}
.user-menu-item:hover { background: var(--bg2); }
.user-menu-item.danger { color: #ff4757; }

.loading-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  gap: 16px;
}
.loading-spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
`;

// ─── Google icon SVG ───
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

// ─── Auth Wrapper ───
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setCurrentUid(u.uid);
      else setCurrentUid(null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        console.error("Login error:", e);
        alert("로그인에 실패했습니다. 다시 시도해주세요.");
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (authLoading) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div className="loading-screen">
          <div className="loading-spinner" />
          <span style={{ color: "var(--text3)", fontSize: 14 }}>로딩 중...</span>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div className="login-screen">
          <div className="login-card">
            <div className="login-emoji">📒</div>
            <h1>나의 하루</h1>
            <p>스케줄을 관리하고<br />매일의 느낀점을 기록해요</p>
            <button className="google-btn" onClick={handleLogin}>
              <GoogleIcon />
              Google로 시작하기
            </button>
          </div>
        </div>
      </>
    );
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

// ─── Main App (after login) ───
function MainApp({ user, onLogout }) {
  const [page, setPage] = useState("home");
  const [today, setToday] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [schedules, setSchedules] = useState({});
  const [defaults, setDefaults] = useState([]);
  const [journals, setJournals] = useState({});
  const [dailyJournals, setDailyJournals] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showDailyJournalModal, setShowDailyJournalModal] = useState(false);
  const [showNextWeekPopup, setShowNextWeekPopup] = useState(false);
  const [showDefaultSetup, setShowDefaultSetup] = useState(false);
  const [showViewJournal, setShowViewJournal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [dragCreate, setDragCreate] = useState(null); // { date, startH, startM, endH, endM }
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Load data from persistent storage
  useEffect(() => {
    (async () => {
      const [s, d, j, dj] = await Promise.all([
        cloudLoad(STORAGE_KEYS.schedules),
        cloudLoad(STORAGE_KEYS.defaults),
        cloudLoad(STORAGE_KEYS.journals),
        cloudLoad(STORAGE_KEYS.dailyJournals),
      ]);
      if (s) setSchedules(s);
      if (d) setDefaults(d);
      if (j) setJournals(j);
      if (dj) setDailyJournals(dj);
      setLoaded(true);
    })();
  }, []);

  // Save on changes
  useEffect(() => { if (loaded) cloudSave(STORAGE_KEYS.schedules, schedules); }, [schedules, loaded]);
  useEffect(() => { if (loaded) cloudSave(STORAGE_KEYS.defaults, defaults); }, [defaults, loaded]);
  useEffect(() => { if (loaded) cloudSave(STORAGE_KEYS.journals, journals); }, [journals, loaded]);
  useEffect(() => { if (loaded) cloudSave(STORAGE_KEYS.dailyJournals, dailyJournals); }, [dailyJournals, loaded]);

  // Check if Sunday → show next week popup
  useEffect(() => {
    if (!loaded) return;
    const now = new Date();
    if (isSunday(now)) {
      const nextMon = getMonday(new Date(now.getTime() + 86400000));
      const wk = weekKey(nextMon);
      if (!schedules[wk] || schedules[wk].length === 0) {
        setShowNextWeekPopup(true);
      }
    }
  }, [loaded]);

  const monday = getMonday(viewDate);
  const currentWeekKey = weekKey(monday);
  const weekDates = getWeekDates(monday);
  const dayIndex = (() => {
    const d = viewDate.getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const dateStr = formatDate(viewDate);

  // Get schedules for a specific date
  const getSchedulesForDate = useCallback((d) => {
    const mon = getMonday(d);
    const wk = weekKey(mon);
    const all = schedules[wk] || [];
    return all.filter(s => s.date === formatDate(d));
  }, [schedules]);

  const todaySchedules = getSchedulesForDate(viewDate);

  // Add schedule
  const addSchedule = (item) => {
    const mon = getMonday(parseDate(item.date));
    const wk = weekKey(mon);
    setSchedules(prev => ({
      ...prev,
      [wk]: [...(prev[wk] || []), { ...item, id: generateId(), colorIdx: item.colorIdx ?? (prev[wk] || []).length }],
    }));
  };

  // Update schedule
  const updateSchedule = (id, updates) => {
    setSchedules(prev => {
      const next = { ...prev };
      for (const wk of Object.keys(next)) {
        next[wk] = next[wk].map(s => s.id === id ? { ...s, ...updates } : s);
      }
      return next;
    });
  };

  // Delete schedule
  const deleteSchedule = (id) => {
    setSchedules(prev => {
      const next = { ...prev };
      for (const wk of Object.keys(next)) {
        next[wk] = next[wk].filter(s => s.id !== id);
      }
      return next;
    });
  };

  // Apply defaults to a week
  const applyDefaultsToWeek = (targetMonday) => {
    const wk = weekKey(targetMonday);
    const dates = getWeekDates(targetMonday);
    const items = [];
    defaults.forEach((def, idx) => {
      def.days.forEach(dayIdx => {
        const dt = def.dayTimes && def.dayTimes[dayIdx] ? def.dayTimes[dayIdx] : { startH: def.startH ?? 9, startM: def.startM ?? 0, endH: def.endH ?? 10, endM: def.endM ?? 0 };
        items.push({
          id: generateId(),
          title: def.title,
          date: formatDate(dates[dayIdx]),
          startH: dt.startH,
          startM: dt.startM,
          endH: dt.endH,
          endM: dt.endM,
          colorIdx: idx,
        });
      });
    });
    setSchedules(prev => ({ ...prev, [wk]: items }));
  };

  // Save journal
  const saveJournal = (scheduleId, data) => {
    setJournals(prev => ({
      ...prev,
      [scheduleId]: data,
    }));
  };

  // Delete journal
  const deleteJournal = (scheduleId) => {
    setJournals(prev => {
      const next = { ...prev };
      delete next[scheduleId];
      return next;
    });
  };

  // Save daily journal
  const saveDailyJournal = (dateKey, data) => {
    setDailyJournals(prev => ({
      ...prev,
      [dateKey]: data,
    }));
  };

  // Delete daily journal
  const deleteDailyJournal = (dateKey) => {
    setDailyJournals(prev => {
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
  };

  // Navigate date
  const prevDay = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 1);
    setViewDate(d);
  };
  const nextDay = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 1);
    setViewDate(d);
  };

  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-title">나의 하루 📒</div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => { setShowDefaultSetup(true); }} title="기본 시간표 설정">
              <SettingsIcon />
            </button>
            <div className="user-profile" onClick={() => setShowUserMenu(!showUserMenu)}>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="user-avatar" referrerPolicy="no-referrer" />
              ) : (
                <div className="user-avatar" style={{ background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  {(user.displayName || "U")[0]}
                </div>
              )}
            </div>
            {showUserMenu && (
              <>
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 140 }} onClick={() => setShowUserMenu(false)} />
                <div className="user-menu">
                  <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                    {user.displayName || user.email}
                  </div>
                  <button className="user-menu-item danger" onClick={() => { setShowUserMenu(false); onLogout(); }}>
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {page === "home" && (
            <HomePage
              viewDate={viewDate}
              dateStr={dateStr}
              dayIndex={dayIndex}
              todaySchedules={todaySchedules}
              journals={journals}
              dailyJournals={dailyJournals}
              prevDay={prevDay}
              nextDay={nextDay}
              onAddSchedule={() => setShowAddModal(true)}
              onScheduleClick={(s) => {
                setSelectedSchedule(s);
                if (journals[s.id]) {
                  setShowViewJournal(true);
                } else {
                  setShowJournalModal(true);
                }
              }}
              onDailyJournal={() => setShowDailyJournalModal(true)}
              onViewDailyJournal={() => setShowDailyJournalModal(true)}
              onDragCreate={(info) => { setDragCreate(info); setShowAddModal(true); }}
            />
          )}
          {page === "week" && (
            <WeekPage
              monday={monday}
              weekDates={weekDates}
              schedules={schedules}
              currentWeekKey={currentWeekKey}
              journals={journals}
              onPrevWeek={() => {
                const d = new Date(viewDate);
                d.setDate(d.getDate() - 7);
                setViewDate(d);
              }}
              onNextWeek={() => {
                const d = new Date(viewDate);
                d.setDate(d.getDate() + 7);
                setViewDate(d);
              }}
              onScheduleClick={(s) => {
                setSelectedSchedule(s);
                if (journals[s.id]) {
                  setShowViewJournal(true);
                } else {
                  setShowJournalModal(true);
                }
              }}
              onDragCreate={(info) => { setDragCreate(info); setShowAddModal(true); }}
            />
          )}
          {page === "register" && (
            <RegisterPage
              viewDate={viewDate}
              monday={monday}
              weekDates={weekDates}
              schedules={schedules}
              currentWeekKey={currentWeekKey}
              defaults={defaults}
              onApplyDefaults={() => applyDefaultsToWeek(monday)}
              onAddSchedule={() => setShowAddModal(true)}
              onEditSchedule={(s) => { setEditItem(s); setShowAddModal(true); }}
              onDeleteSchedule={deleteSchedule}
            />
          )}
          {page === "records" && (
            <RecordsPage
              schedules={schedules}
              journals={journals}
              dailyJournals={dailyJournals}
              onDeleteJournal={deleteJournal}
              onDeleteDailyJournal={deleteDailyJournal}
            />
          )}
        </div>

        {/* Bottom Nav */}
        <nav className="bottom-nav">
          <button className={`nav-item ${page === "home" ? "active" : ""}`} onClick={() => setPage("home")}>
            <HomeIcon />
            <span>오늘</span>
          </button>
          <button className={`nav-item ${page === "week" ? "active" : ""}`} onClick={() => setPage("week")}>
            <CalendarWeekIcon />
            <span>주간</span>
          </button>
          <button className={`nav-item ${page === "records" ? "active" : ""}`} onClick={() => setPage("records")}>
            <BookIcon />
            <span>기록</span>
          </button>
          <button className={`nav-item ${page === "register" ? "active" : ""}`} onClick={() => setPage("register")}>
            <PenIcon size={22} />
            <span>스케줄</span>
          </button>
        </nav>

        {/* Add/Edit Schedule Modal */}
        {showAddModal && (
          <ScheduleFormModal
            editItem={editItem}
            dragCreate={dragCreate}
            viewDate={viewDate}
            weekDates={weekDates}
            onSave={(item) => {
              if (editItem) {
                updateSchedule(editItem.id, item);
              } else {
                addSchedule(item);
              }
              setShowAddModal(false);
              setEditItem(null);
              setDragCreate(null);
            }}
            onClose={() => { setShowAddModal(false); setEditItem(null); setDragCreate(null); }}
          />
        )}

        {/* Journal Modal */}
        {showJournalModal && selectedSchedule && (
          <JournalModal
            schedule={selectedSchedule}
            existingJournal={journals[selectedSchedule.id]}
            onSave={(data) => {
              saveJournal(selectedSchedule.id, data);
              setShowJournalModal(false);
              setSelectedSchedule(null);
            }}
            onClose={() => { setShowJournalModal(false); setSelectedSchedule(null); }}
          />
        )}

        {/* View Journal Modal */}
        {showViewJournal && selectedSchedule && journals[selectedSchedule.id] && (
          <ViewJournalModal
            schedule={selectedSchedule}
            journal={journals[selectedSchedule.id]}
            onEdit={() => {
              setShowViewJournal(false);
              setShowJournalModal(true);
            }}
            onDelete={() => {
              deleteJournal(selectedSchedule.id);
              setShowViewJournal(false);
              setSelectedSchedule(null);
            }}
            onClose={() => { setShowViewJournal(false); setSelectedSchedule(null); }}
          />
        )}

        {/* Daily Journal Modal */}
        {showDailyJournalModal && (
          <DailyJournalModal
            dateStr={dateStr}
            existingJournal={dailyJournals[dateStr]}
            onSave={(data) => {
              saveDailyJournal(dateStr, data);
              setShowDailyJournalModal(false);
            }}
            onClose={() => setShowDailyJournalModal(false)}
          />
        )}

        {/* Default Setup Modal */}
        {showDefaultSetup && (
          <DefaultSetupModal
            defaults={defaults}
            onSave={(d) => { setDefaults(d); setShowDefaultSetup(false); }}
            onClose={() => setShowDefaultSetup(false)}
          />
        )}

        {/* Next Week Popup */}
        {showNextWeekPopup && (
          <div className="popup-overlay" onClick={() => setShowNextWeekPopup(false)}>
            <div className="popup" onClick={e => e.stopPropagation()}>
              <h3>📅 다음 주 준비!</h3>
              <p>다음 주 스케줄이 아직 등록되지 않았어요.<br />지금 등록할까요?</p>
              <div className="popup-actions">
                <button className="btn btn-secondary" onClick={() => setShowNextWeekPopup(false)}>나중에</button>
                <button className="btn btn-primary" onClick={() => {
                  setShowNextWeekPopup(false);
                  const nextMon = getMonday(new Date(today.getTime() + 86400000));
                  setViewDate(new Date(nextMon));
                  setPage("register");
                }}>등록하기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Home Page ───
function HomePage({ viewDate, dateStr, dayIndex, todaySchedules, journals, dailyJournals, prevDay, nextDay, onAddSchedule, onScheduleClick, onDailyJournal, onViewDailyJournal, onDragCreate }) {
  const dayLabel = `${viewDate.getMonth() + 1}월 ${viewDate.getDate()}일 (${DAYS_KR[dayIndex]})`;
  const isToday = formatDate(viewDate) === formatDate(new Date());
  const hasDailyJournal = !!dailyJournals[dateStr];

  // Summary calculations
  const totalCount = todaySchedules.length;
  const journalCount = todaySchedules.filter(s => journals[s.id]).length;
  const totalMinutes = todaySchedules.reduce((sum, s) => sum + (timeToMin(s.endH, s.endM) - timeToMin(s.startH, s.startM)), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainMin = totalMinutes % 60;

  // Find next upcoming schedule (only for today)
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const sortedScheds = [...todaySchedules].sort((a, b) => timeToMin(a.startH, a.startM) - timeToMin(b.startH, b.startM));
  const nextSched = isToday ? sortedScheds.find(s => timeToMin(s.startH, s.startM) > currentMin) : null;
  const currentSched = isToday ? sortedScheds.find(s => timeToMin(s.startH, s.startM) <= currentMin && timeToMin(s.endH, s.endM) > currentMin) : null;

  return (
    <>
      <div className="day-nav">
        <button onClick={prevDay}><ChevronLeft /></button>
        <h2>{isToday ? "오늘 " : ""}{dayLabel}</h2>
        <button onClick={nextDay}><ChevronRight /></button>
      </div>

      {/* Summary card */}
      {totalCount > 0 && (
        <div className="day-summary">
          <div className="day-summary-stat">
            <div className="stat-value" style={{ color: "var(--accent)" }}>{totalCount}</div>
            <div className="stat-label">일정</div>
          </div>
          <div className="day-summary-stat">
            <div className="stat-value" style={{ color: "var(--accent3)" }}>
              {totalHours > 0 ? `${totalHours}h` : ""}{remainMin > 0 ? `${remainMin}m` : ""}{totalMinutes === 0 ? "0" : ""}
            </div>
            <div className="stat-label">총 시간</div>
          </div>
          <div className="day-summary-stat">
            <div className="stat-value" style={{ color: journalCount > 0 ? "#2ED573" : "var(--text3)" }}>{journalCount}/{totalCount}</div>
            <div className="stat-label">기록 완료</div>
          </div>
        </div>
      )}

      {/* Current / Next schedule indicator */}
      {isToday && (currentSched || nextSched) && (
        <div className="day-summary-next">
          {currentSched ? (
            <>
              <div className="next-dot" style={{ background: getColor(currentSched.colorIdx || 0) }} />
              <div className="next-info">
                <div className="next-label">지금 진행 중</div>
                <div className="next-title">{currentSched.title}</div>
              </div>
              <div className="next-time">{formatTime(currentSched.endH, currentSched.endM)}까지</div>
            </>
          ) : nextSched ? (
            <>
              <div className="next-dot" style={{ background: getColor(nextSched.colorIdx || 0) }} />
              <div className="next-info">
                <div className="next-label">다음 일정</div>
                <div className="next-title">{nextSched.title}</div>
              </div>
              <div className="next-time">{formatTime(nextSched.startH, nextSched.startM)}</div>
            </>
          ) : null}
        </div>
      )}

      <DayTimetable
        schedules={todaySchedules}
        journals={journals}
        dateStr={dateStr}
        onScheduleClick={onScheduleClick}
        onDragCreate={onDragCreate}
      />

      {/* 오늘의 느낀점 */}
      {hasDailyJournal ? (
        <div className="journal-section" onClick={onViewDailyJournal} style={{ cursor: "pointer" }}>
          <h4>📝 오늘의 느낀점</h4>
          <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {(dailyJournals[dateStr].text || dailyJournals[dateStr].voiceText || "")?.slice(0, 100)}{(dailyJournals[dateStr].text || dailyJournals[dateStr].voiceText || "")?.length > 100 ? "..." : ""}
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {(dailyJournals[dateStr].hasVoice || dailyJournals[dateStr].type === "voice" || dailyJournals[dateStr].audioURL) && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--accent)" }}>
                <MicIcon size={14} color="var(--accent)" /> 음성기록
              </span>
            )}
            {(dailyJournals[dateStr].hasText || dailyJournals[dateStr].type === "text" || (dailyJournals[dateStr].text && !dailyJournals[dateStr].audioURL && !dailyJournals[dateStr].hasVoice)) && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--accent3)" }}>
                <TextIcon size={14} color="var(--accent3)" /> 문자기록
              </span>
            )}
          </div>
        </div>
      ) : (
        <button className="today-feeling-btn" onClick={onDailyJournal}>
          ✨ 오늘의 느낀점 남기기
        </button>
      )}
    </>
  );
}

// ─── Day Timetable ───
function DayTimetable({ schedules, journals, dateStr, onScheduleClick, onDragCreate }) {
  const gridRef = useRef(null);
  const [dragState, setDragState] = useState(null); // { startMin, currentMin }
  const dragRef = useRef(null);
  const longPressTimer = useRef(null);

  const DEFAULT_MIN_HOUR = 7;
  const DEFAULT_MAX_HOUR = 21;

  const allMins = schedules.length
    ? schedules.flatMap(s => [timeToMin(s.startH, s.startM), timeToMin(s.endH, s.endM)])
    : [DEFAULT_MIN_HOUR * 60, DEFAULT_MAX_HOUR * 60];
  const minHour = Math.max(0, Math.floor(Math.min(...allMins) / 60) - 1);
  const maxHour = Math.min(24, Math.ceil(Math.max(...allMins) / 60) + 1);
  const totalMinutes = (maxHour - minHour) * 60;
  const PX_PER_MIN = 1.2;
  const height = totalMinutes * PX_PER_MIN;
  const hours = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);

  const getMinFromY = useCallback((clientY) => {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const rawMin = minHour * 60 + y / PX_PER_MIN;
    return Math.round(rawMin / 5) * 5;
  }, [minHour]);

  const handlePointerDown = (e) => {
    if (e.target.closest(".schedule-block")) return;
    const min = getMinFromY(e.clientY);
    const pointerId = e.pointerId;
    // Start long-press timer — drag mode activates after 300ms hold
    longPressTimer.current = setTimeout(() => {
      dragRef.current = { startMin: min, active: true };
      setDragState({ startMin: min, currentMin: min });
      try { gridRef.current?.setPointerCapture(pointerId); } catch {}
    }, 300);
    dragRef.current = { startMin: min, active: false };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    if (!dragRef.current.active) {
      // User moved before long-press fired → cancel, let scroll happen
      clearTimeout(longPressTimer.current);
      dragRef.current = null;
      return;
    }
    const min = getMinFromY(e.clientY);
    setDragState(prev => prev ? { ...prev, currentMin: min } : null);
  };

  const handlePointerUp = (e) => {
    clearTimeout(longPressTimer.current);
    if (!dragRef.current || !dragRef.current.active) {
      dragRef.current = null;
      setDragState(null);
      return;
    }
    const { startMin } = dragRef.current;
    const endMin = getMinFromY(e.clientY);
    dragRef.current = null;
    setDragState(null);

    if (Math.abs(endMin - startMin) < 10) return;

    const lo = Math.min(startMin, endMin);
    const hi = Math.max(startMin, endMin);
    const s = minToTime(lo);
    const eT = minToTime(hi);
    if (onDragCreate) {
      onDragCreate({ date: dateStr, startH: s.h, startM: s.m, endH: eT.h, endM: eT.m });
    }
  };

  const handlePointerCancel = () => {
    clearTimeout(longPressTimer.current);
    dragRef.current = null;
    setDragState(null);
  };

  // Compute drag selection box
  let dragTop = 0, dragHeight = 0, dragLabel = "";
  if (dragState) {
    const lo = Math.min(dragState.startMin, dragState.currentMin);
    const hi = Math.max(dragState.startMin, dragState.currentMin);
    dragTop = (lo - minHour * 60) * PX_PER_MIN;
    dragHeight = (hi - lo) * PX_PER_MIN;
    const s = minToTime(lo);
    const eT = minToTime(hi);
    dragLabel = `${formatTime(s.h, s.m)} - ${formatTime(eT.h, eT.m)}`;
  }

  return (
    <div className="timetable" style={{ height: height + 20, position: "relative" }}>
      {hours.map(h => (
        <div key={h}>
          <div className="time-label" style={{ top: (h - minHour) * 60 * PX_PER_MIN + 8 }}>
            {String(h).padStart(2, "0")}:00
          </div>
          <div className="hour-line" style={{ top: (h - minHour) * 60 * PX_PER_MIN + 8 }} />
        </div>
      ))}
      <div
        className="timetable-grid"
        style={{ height, touchAction: dragState ? "none" : "auto" }}
        ref={gridRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {schedules.map((s) => {
          const topMin = timeToMin(s.startH, s.startM) - minHour * 60;
          const durMin = timeToMin(s.endH, s.endM) - timeToMin(s.startH, s.startM);
          const top = topMin * PX_PER_MIN + 8;
          const h = Math.max(durMin * PX_PER_MIN, 28);
          const color = getColor(s.colorIdx || 0);
          const journal = journals[s.id];
          return (
            <div
              key={s.id}
              className="schedule-block"
              style={{ top, height: h, background: color }}
              onClick={() => onScheduleClick(s)}
            >
              <div className="block-title">{s.title}</div>
              {h > 36 && (
                <div className="block-time">
                  {formatTime(s.startH, s.startM)} - {formatTime(s.endH, s.endM)}
                </div>
              )}
              {journal && (
                <div className="journal-icons">
                  {(journal.hasVoice || journal.type === "voice" || journal.audioURL) && <MicIcon size={14} color="rgba(255,255,255,0.9)" />}
                  {(journal.hasText || journal.type === "text" || (journal.text && !journal.audioURL && !journal.hasVoice)) && <TextIcon size={14} color="rgba(255,255,255,0.9)" />}
                </div>
              )}
            </div>
          );
        })}
        {dragState && dragHeight > 5 && (
          <div className="drag-selection" style={{ top: dragTop, height: dragHeight }}>
            {dragHeight > 20 && dragLabel}
          </div>
        )}
      </div>
      {schedules.length === 0 && !dragState && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          color: "var(--text3)", fontSize: 13, textAlign: "center", pointerEvents: "none",
        }}>
          꾹 눌러서 드래그하면 스케줄을 추가할 수 있어요
        </div>
      )}
    </div>
  );
}

// ─── Week Day Column with drag ───
function WeekDayCol({ date, dateStr, dayScheds, minHour, maxHour, PX_PER_MIN, gridH, hours, journals, onScheduleClick, onDragCreate }) {
  const colRef = useRef(null);
  const dragRef = useRef(null);
  const longPressTimer = useRef(null);
  const [dragState, setDragState] = useState(null);

  const getMinFromY = useCallback((clientY) => {
    if (!colRef.current) return 0;
    const rect = colRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const rawMin = minHour * 60 + y / PX_PER_MIN;
    return Math.round(rawMin / 5) * 5;
  }, [minHour, PX_PER_MIN]);

  const handlePointerDown = (e) => {
    if (e.target.closest(".week-block")) return;
    const min = getMinFromY(e.clientY);
    const pointerId = e.pointerId;
    longPressTimer.current = setTimeout(() => {
      dragRef.current = { startMin: min, active: true };
      setDragState({ startMin: min, currentMin: min });
      try { colRef.current?.setPointerCapture(pointerId); } catch {}
    }, 300);
    dragRef.current = { startMin: min, active: false };
  };
  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    if (!dragRef.current.active) {
      clearTimeout(longPressTimer.current);
      dragRef.current = null;
      return;
    }
    setDragState(prev => prev ? { ...prev, currentMin: getMinFromY(e.clientY) } : null);
  };
  const handlePointerUp = (e) => {
    clearTimeout(longPressTimer.current);
    if (!dragRef.current || !dragRef.current.active) {
      dragRef.current = null;
      setDragState(null);
      return;
    }
    const { startMin } = dragRef.current;
    const endMin = getMinFromY(e.clientY);
    dragRef.current = null;
    setDragState(null);
    if (Math.abs(endMin - startMin) < 10) return;
    const lo = Math.min(startMin, endMin);
    const hi = Math.max(startMin, endMin);
    const s = minToTime(lo);
    const eT = minToTime(hi);
    if (onDragCreate) onDragCreate({ date: dateStr, startH: s.h, startM: s.m, endH: eT.h, endM: eT.m });
  };
  const handlePointerCancel = () => {
    clearTimeout(longPressTimer.current);
    dragRef.current = null;
    setDragState(null);
  };

  let dragTop = 0, dragHeight = 0;
  if (dragState) {
    const lo = Math.min(dragState.startMin, dragState.currentMin);
    const hi = Math.max(dragState.startMin, dragState.currentMin);
    dragTop = (lo - minHour * 60) * PX_PER_MIN;
    dragHeight = (hi - lo) * PX_PER_MIN;
  }

  return (
    <div
      ref={colRef}
      className="week-col"
      style={{ height: gridH, position: "relative", touchAction: dragState ? "none" : "auto" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {hours.map(h => (
        <div key={h} style={{
          position: "absolute",
          top: (h - minHour) * 60 * PX_PER_MIN,
          left: 0, right: 0,
          height: 1,
          background: "var(--border)",
        }} />
      ))}
      {dayScheds.map(s => {
        const topMin = timeToMin(s.startH, s.startM) - minHour * 60;
        const durMin = timeToMin(s.endH, s.endM) - timeToMin(s.startH, s.startM);
        return (
          <div
            key={s.id}
            className="week-block"
            style={{
              top: topMin * PX_PER_MIN,
              height: Math.max(durMin * PX_PER_MIN, 18),
              background: getColor(s.colorIdx || 0),
            }}
            onClick={() => onScheduleClick(s)}
            title={`${s.title} ${formatTime(s.startH, s.startM)}-${formatTime(s.endH, s.endM)}`}
          >
            {durMin > 30 ? s.title : s.title.slice(0, 4)}
            {journals[s.id] && (
              <span style={{ marginLeft: 2 }}>
                {(journals[s.id].hasVoice || journals[s.id].type === "voice" || journals[s.id].audioURL) && "🎙"}
                {(journals[s.id].hasText || journals[s.id].type === "text" || (journals[s.id].text && !journals[s.id].audioURL && !journals[s.id].hasVoice)) && "📝"}
              </span>
            )}
          </div>
        );
      })}
      {dragState && dragHeight > 3 && (
        <div className="week-drag-selection" style={{ top: dragTop, height: dragHeight }} />
      )}
    </div>
  );
}

// ─── Week Page ───
function WeekPage({ monday, weekDates, schedules, currentWeekKey, journals, onPrevWeek, onNextWeek, onScheduleClick, onDragCreate }) {
  const weekScheds = schedules[currentWeekKey] || [];
  const todayStr = formatDate(new Date());

  const allMins = weekScheds.length
    ? weekScheds.flatMap(s => [timeToMin(s.startH, s.startM), timeToMin(s.endH, s.endM)])
    : [7 * 60, 18 * 60];
  const minHour = Math.max(0, Math.floor(Math.min(...allMins) / 60) - 1);
  const maxHour = Math.min(24, Math.ceil(Math.max(...allMins) / 60) + 1);
  const totalMin = (maxHour - minHour) * 60;
  const PX_PER_MIN = 1;
  const gridH = totalMin * PX_PER_MIN;
  const hours = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);

  return (
    <>
      <div className="day-nav">
        <button onClick={onPrevWeek}><ChevronLeft /></button>
        <h2>{monday.getMonth() + 1}월 {monday.getDate()}일 ~ {weekDates[6].getMonth() + 1}월 {weekDates[6].getDate()}일</h2>
        <button onClick={onNextWeek}><ChevronRight /></button>
      </div>

      <div className="timetable week-timetable" style={{ padding: 0 }}>
        <div className="week-grid">
          <div className="week-header" style={{ borderBottom: "2px solid var(--border)" }}></div>
          {weekDates.map((d, i) => (
            <div key={i} className={`week-header ${formatDate(d) === todayStr ? "today" : ""}`}>
              {DAYS_KR[i]}<br />
              <span style={{ fontSize: 11 }}>{d.getDate()}</span>
            </div>
          ))}

          {/* Time column + day columns */}
          <div style={{ position: "relative", height: gridH }}>
            {hours.map(h => (
              <div key={h} style={{
                position: "absolute",
                top: (h - minHour) * 60 * PX_PER_MIN,
                width: "100%",
                fontSize: 10,
                color: "var(--text3)",
                textAlign: "right",
                paddingRight: 4,
                transform: "translateY(-6px)",
              }}>
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>

          {weekDates.map((d, di) => {
            const dayScheds = weekScheds.filter(s => s.date === formatDate(d));
            return (
              <WeekDayCol
                key={di}
                date={d}
                dateStr={formatDate(d)}
                dayScheds={dayScheds}
                minHour={minHour}
                maxHour={maxHour}
                PX_PER_MIN={PX_PER_MIN}
                gridH={gridH}
                hours={hours}
                journals={journals}
                onScheduleClick={onScheduleClick}
                onDragCreate={onDragCreate}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Register Page ───
function RegisterPage({ viewDate, monday, weekDates, schedules, currentWeekKey, defaults, onApplyDefaults, onAddSchedule, onEditSchedule, onDeleteSchedule }) {
  const weekScheds = schedules[currentWeekKey] || [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>
          {monday.getMonth() + 1}월 {monday.getDate()}일 주간
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          {defaults.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={onApplyDefaults}>
              기본 스케줄 불러오기
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={onAddSchedule}>
            <PlusIcon size={16} /> 추가
          </button>
        </div>
      </div>

      {weekScheds.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📋</div>
          <p>이번 주 등록된 스케줄이 없어요.<br />
            {defaults.length > 0 ? "'기본 스케줄 불러오기'를 눌러 기본 시간표를 적용하거나" : "오른쪽 상단 ⚙️에서 기본 시간표를 설정하거나"}<br />
            직접 추가해보세요!</p>
        </div>
      ) : (
        <>
          {weekDates.map((d, di) => {
            const dayScheds = weekScheds.filter(s => s.date === formatDate(d)).sort((a, b) => timeToMin(a.startH, a.startM) - timeToMin(b.startH, b.startM));
            if (dayScheds.length === 0) return null;
            return (
              <div key={di} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 8, fontFamily: "var(--font-display)", fontSize: 17 }}>
                  {DAYS_FULL[di]} ({d.getMonth() + 1}/{d.getDate()})
                </div>
                {dayScheds.map(s => (
                  <div key={s.id} className="sched-item">
                    <div className="color-dot" style={{ background: getColor(s.colorIdx || 0) }} />
                    <div className="sched-info">
                      <div className="sched-title">{s.title}</div>
                      <div className="sched-meta">{formatTime(s.startH, s.startM)} - {formatTime(s.endH, s.endM)}</div>
                    </div>
                    <div className="sched-actions">
                      <button onClick={() => onEditSchedule(s)}><PenIcon /></button>
                      <button onClick={() => onDeleteSchedule(s.id)}><TrashIcon /></button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// ─── Schedule Form Modal ───
function ScheduleFormModal({ editItem, dragCreate, viewDate, weekDates, onSave, onClose }) {
  const prefill = editItem || dragCreate;
  const [title, setTitle] = useState(editItem?.title || "");
  const [dateVal, setDateVal] = useState(prefill?.date || formatDate(viewDate));
  const [startH, setStartH] = useState(prefill?.startH ?? 9);
  const [startM, setStartM] = useState(prefill?.startM ?? 0);
  const [endH, setEndH] = useState(prefill?.endH ?? 10);
  const [endM, setEndM] = useState(prefill?.endM ?? 0);
  const [colorIdx, setColorIdx] = useState(prefill?.colorIdx ?? 0);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), date: dateVal, startH, startM, endH, endM, colorIdx });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3>{editItem ? "스케줄 수정" : "스케줄 추가"}</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="form-group">
          <label className="form-label">제목</label>
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 수학 공부" autoFocus />
        </div>

        <div className="form-group">
          <label className="form-label">색상</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCHEDULE_COLORS.map((c, i) => (
              <button key={i} onClick={() => setColorIdx(i)} style={{
                width: 32, height: 32, borderRadius: "50%",
                background: c, border: colorIdx === i ? "3px solid var(--text)" : "3px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: colorIdx === i ? "0 0 0 2px var(--bg), 0 0 0 4px " + c : "none",
              }} />
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">날짜</label>
          <input className="form-input" type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">시작 시간</label>
          <div className="form-row">
            <select className="form-input" value={startH} onChange={e => setStartH(+e.target.value)}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}시</option>)}
            </select>
            <select className="form-input" value={startM} onChange={e => setStartM(+e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i * 5}>{String(i * 5).padStart(2, "0")}분</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">종료 시간</label>
          <div className="form-row">
            <select className="form-input" value={endH} onChange={e => setEndH(+e.target.value)}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}시</option>)}
            </select>
            <select className="form-input" value={endM} onChange={e => setEndM(+e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i * 5}>{String(i * 5).padStart(2, "0")}분</option>)}
            </select>
          </div>
        </div>

        <button className="btn btn-primary btn-block" onClick={handleSave} style={{ marginTop: 8 }}>
          {editItem ? "수정 완료" : "추가하기"}
        </button>
      </div>
    </div>
  );
}

// ─── Journal Modal (Record feelings — voice + text both supported) ───
function JournalModal({ schedule, existingJournal, onSave, onClose }) {
  const [text, setText] = useState(existingJournal?.text || "");
  const [audioURL, setAudioURL] = useState(existingJournal?.audioURL || null);
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [voiceText, setVoiceText] = useState(existingJournal?.voiceText || "");
  const [uploading, setUploading] = useState(false);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRec = new MediaRecorder(stream);
      mediaRecRef.current = mediaRec;
      chunksRef.current = [];
      mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setUploading(true);
        const base64url = await blobToBase64(blob);
        if (base64url) setAudioURL(base64url);
        setUploading(false);
      };
      mediaRec.start(250);
      setIsRecording(true);
      setRecTime(0);
      timerRef.current = setInterval(() => setRecTime(p => p + 1), 1000);

      // Speech recognition — runs alongside recording
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "ko-KR";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let finalTranscript = "";

        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += t + " ";
            } else {
              interim = t;
            }
          }
          setVoiceText(finalTranscript + interim);
        };

        recognition.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          console.warn("Speech recognition error:", e.error);
        };

        // Auto-restart if recognition ends while still recording
        recognition.onend = () => {
          if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
            try { recognition.start(); } catch {}
          }
        };

        try { recognition.start(); } catch {}
        mediaRecRef.current._recognition = recognition;
        mediaRecRef.current._getFinalTranscript = () => finalTranscript;
      }
    } catch (err) {
      alert("마이크 접근이 필요합니다. 브라우저 설정을 확인해주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current) {
      mediaRecRef.current.stop();
      if (mediaRecRef.current._recognition) {
        const finalText = mediaRecRef.current._getFinalTranscript?.() || "";
        mediaRecRef.current._recognition.onend = null; // prevent auto-restart
        mediaRecRef.current._recognition.stop();
        if (finalText.trim()) setVoiceText(finalText.trim());
      }
    }
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const removeAudio = () => { setAudioURL(null); setVoiceText(""); };

  const handleSave = () => {
    if (!text.trim() && !audioURL && !voiceText.trim()) return;
    onSave({
      text: text.trim(),
      audioURL,
      voiceText: voiceText.trim(),
      hasVoice: !!(audioURL || voiceText.trim()),
      hasText: !!text.trim(),
      recordedAt: new Date().toISOString(),
    });
  };

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3>느낀점 기록하기</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          <span style={{ fontWeight: 600 }}>{schedule.title}</span> ({formatTime(schedule.startH, schedule.startM)} - {formatTime(schedule.endH, schedule.endM)})
        </p>

        {/* Voice section */}
        <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
            <MicIcon size={18} color="var(--accent)" /> 음성 기록
          </div>
          <div className="recording-area" style={{ padding: 10 }}>
            {!isRecording ? (
              <button className="rec-btn start" onClick={startRecording} style={{ width: 52, height: 52 }}>
                <MicIcon size={22} color="#fff" />
              </button>
            ) : (
              <>
                <div className="rec-timer" style={{ fontSize: 24 }}>{fmtTime(recTime)}</div>
                <button className="rec-btn stop" onClick={stopRecording} style={{ width: 52, height: 52 }}>
                  <StopIcon size={20} />
                </button>
              </>
            )}
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {isRecording ? "녹음 중... 느낀점을 말해주세요" : audioURL ? "녹음 완료" : "버튼을 눌러 녹음하세요"}
            </span>
          </div>
          {audioURL && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SafeAudioPlayer src={audioURL} style={{ flex: 1 }} />
                <button className="icon-btn" style={{ flexShrink: 0, width: 36, height: 36 }} title="다운로드" onClick={() => {
                  fetch(audioURL).then(r => r.blob()).then(blob => {
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = u; a.download = `${schedule.title}_녹음.webm`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
                  }).catch(() => window.open(audioURL, "_blank"));
                }}>
                  <DownloadIcon size={18} />
                </button>
              </div>
              <button onClick={removeAudio} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>녹음 삭제</button>
            </div>
          )}
          {(voiceText || audioURL) && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">음성 변환 텍스트 (수정 가능)</label>
              <textarea className="journal-textarea" style={{ minHeight: 60 }} value={voiceText} onChange={e => setVoiceText(e.target.value)} placeholder="음성이 텍스트로 변환됩니다..." />
            </div>
          )}
        </div>

        {/* Text section */}
        <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 14, fontWeight: 600, color: "var(--accent3)" }}>
            <TextIcon size={18} color="var(--accent3)" /> 문자 기록
          </div>
          <textarea className="journal-textarea" value={text} onChange={e => setText(e.target.value)} placeholder="느낀 점을 자유롭게 적어보세요..." />
        </div>

        <button className="btn btn-primary btn-block" onClick={handleSave} style={{ marginTop: 4 }} disabled={uploading}>
          {uploading ? "업로드 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}

// ─── Audio Player (fixes base64 playback bar issue) ───
function SafeAudioPlayer({ src, style }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:")) {
      fetch(src).then(r => r.blob()).then(blob => {
        setBlobUrl(URL.createObjectURL(blob));
      }).catch(() => setBlobUrl(src));
    } else {
      setBlobUrl(src);
    }
    return () => { if (blobUrl && blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl); };
  }, [src]);
  if (!blobUrl) return null;
  return <audio controls preload="metadata" className="audio-player" src={blobUrl} style={style} />;
}

// ─── View Journal Modal ───
function ViewJournalModal({ schedule, journal, onEdit, onDelete, onClose }) {
  const hasVoice = journal.hasVoice || journal.type === "voice" || !!journal.audioURL;
  const hasText = journal.hasText || journal.type === "text" || !!journal.text;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDownloadAudio = async () => {
    if (!journal.audioURL) return;
    try {
      const res = await fetch(journal.audioURL);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = journal.recordedAt ? new Date(journal.recordedAt).toISOString().slice(0, 10) : "audio";
      a.download = `${schedule.title}_${dateStr}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      window.open(journal.audioURL, "_blank");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3>느낀점 보기</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          <span style={{ fontWeight: 600 }}>{schedule.title}</span> ({formatTime(schedule.startH, schedule.startM)} - {formatTime(schedule.endH, schedule.endM)})
        </p>

        {hasVoice && (
          <div className="journal-entry" style={{ marginBottom: 10 }}>
            <div className="journal-entry-header">
              <div className="journal-entry-type">
                <MicIcon size={14} color="var(--accent)" /> 음성 기록
              </div>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>
                {journal.recordedAt ? new Date(journal.recordedAt).toLocaleDateString("ko-KR") : ""}
              </span>
            </div>
            {journal.audioURL && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <SafeAudioPlayer src={journal.audioURL} style={{ flex: 1, marginBottom: 0 }} />
                <button onClick={handleDownloadAudio} className="icon-btn" style={{ flexShrink: 0, width: 36, height: 36 }} title="다운로드">
                  <DownloadIcon size={18} />
                </button>
              </div>
            )}
            {(journal.voiceText || (!journal.hasText && journal.text)) && (
              <div className="journal-entry-text">{journal.voiceText || journal.text}</div>
            )}
          </div>
        )}

        {hasText && (
          <div className="journal-entry">
            <div className="journal-entry-header">
              <div className="journal-entry-type">
                <TextIcon size={14} color="var(--accent3)" /> 문자 기록
              </div>
            </div>
            <div className="journal-entry-text">{journal.text || "(내용 없음)"}</div>
          </div>
        )}

        {!hasVoice && !hasText && (
          <div className="journal-entry">
            <div className="journal-entry-text">(내용 없음)</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={onEdit} style={{ flex: 1 }}>수정하기</button>
          {!confirmDelete ? (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)} style={{ flexShrink: 0 }}>
              <TrashIcon size={16} />
            </button>
          ) : (
            <button className="btn btn-danger" onClick={onDelete} style={{ flexShrink: 0, fontSize: 13 }}>삭제 확인</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Daily Journal Modal (combined voice + text) ───
function DailyJournalModal({ dateStr, existingJournal, onSave, onClose }) {
  const [text, setText] = useState(existingJournal?.text || "");
  const [audioURL, setAudioURL] = useState(existingJournal?.audioURL || null);
  const [voiceText, setVoiceText] = useState(existingJournal?.voiceText || "");
  const [isRecording, setIsRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRec = new MediaRecorder(stream);
      mediaRecRef.current = mediaRec;
      chunksRef.current = [];
      mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setUploading(true);
        const base64url = await blobToBase64(blob);
        if (base64url) setAudioURL(base64url);
        setUploading(false);
      };
      mediaRec.start(250);
      setIsRecording(true);
      setRecTime(0);
      timerRef.current = setInterval(() => setRecTime(p => p + 1), 1000);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "ko-KR";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let finalTranscript = "";

        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += t + " ";
            } else {
              interim = t;
            }
          }
          setVoiceText(finalTranscript + interim);
        };

        recognition.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          console.warn("Speech recognition error:", e.error);
        };

        recognition.onend = () => {
          if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
            try { recognition.start(); } catch {}
          }
        };

        try { recognition.start(); } catch {}
        mediaRecRef.current._recognition = recognition;
        mediaRecRef.current._getFinalTranscript = () => finalTranscript;
      }
    } catch (err) {
      alert("마이크 접근이 필요합니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecRef.current) {
      mediaRecRef.current.stop();
      if (mediaRecRef.current._recognition) {
        const finalText = mediaRecRef.current._getFinalTranscript?.() || "";
        mediaRecRef.current._recognition.onend = null;
        mediaRecRef.current._recognition.stop();
        if (finalText.trim()) setVoiceText(finalText.trim());
      }
    }
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const removeAudio = () => { setAudioURL(null); setVoiceText(""); };

  const handleSave = () => {
    if (!text.trim() && !audioURL && !voiceText.trim()) return;
    onSave({
      text: text.trim(),
      audioURL,
      voiceText: voiceText.trim(),
      hasVoice: !!(audioURL || voiceText.trim()),
      hasText: !!text.trim(),
      recordedAt: new Date().toISOString(),
    });
  };

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3>✨ 오늘의 느낀점</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>{dateStr}</p>

        {/* Voice section */}
        <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
            <MicIcon size={18} color="var(--accent)" /> 음성 기록
          </div>
          <div className="recording-area" style={{ padding: 10 }}>
            {!isRecording ? (
              <button className="rec-btn start" onClick={startRecording} style={{ width: 52, height: 52 }}>
                <MicIcon size={22} color="#fff" />
              </button>
            ) : (
              <>
                <div className="rec-timer" style={{ fontSize: 24 }}>{fmtTime(recTime)}</div>
                <button className="rec-btn stop" onClick={stopRecording} style={{ width: 52, height: 52 }}>
                  <StopIcon size={20} />
                </button>
              </>
            )}
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {isRecording ? "녹음 중..." : audioURL ? "녹음 완료" : "버튼을 눌러 녹음하세요"}
            </span>
          </div>
          {audioURL && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SafeAudioPlayer src={audioURL} style={{ flex: 1 }} />
                <button className="icon-btn" style={{ flexShrink: 0, width: 36, height: 36 }} title="다운로드" onClick={() => {
                  fetch(audioURL).then(r => r.blob()).then(blob => {
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = u; a.download = `오늘의느낀점_${dateStr}.webm`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
                  }).catch(() => window.open(audioURL, "_blank"));
                }}>
                  <DownloadIcon size={18} />
                </button>
              </div>
              <button onClick={removeAudio} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>녹음 삭제</button>
            </div>
          )}
          {(voiceText || audioURL) && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">음성 변환 텍스트 (수정 가능)</label>
              <textarea className="journal-textarea" style={{ minHeight: 60 }} value={voiceText} onChange={e => setVoiceText(e.target.value)} placeholder="음성이 텍스트로 변환됩니다..." />
            </div>
          )}
        </div>

        {/* Text section */}
        <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 14, fontWeight: 600, color: "var(--accent3)" }}>
            <TextIcon size={18} color="var(--accent3)" /> 문자 기록
          </div>
          <textarea className="journal-textarea" value={text} onChange={e => setText(e.target.value)} placeholder="오늘 하루를 돌아보며 느낀 점을 자유롭게 적어보세요..." />
        </div>

        <button className="btn btn-primary btn-block" onClick={handleSave} style={{ marginTop: 4 }} disabled={uploading}>{uploading ? "업로드 중..." : "저장하기"}</button>
      </div>
    </div>
  );
}

// ─── Records Page (기록 탭) ───
function RecordsPage({ schedules, journals, dailyJournals, onDeleteJournal, onDeleteDailyJournal }) {
  const [expandedDate, setExpandedDate] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Collect all dates that have any journal entries
  const dateMap = {}; // { "2026-03-26": { scheduleJournals: [...], dailyJournal: {...} } }

  // Schedule journals — find the schedule for each journal entry
  const allScheds = {};
  Object.entries(schedules).forEach(([wk, items]) => {
    items.forEach(s => { allScheds[s.id] = s; });
  });

  Object.entries(journals).forEach(([schedId, journal]) => {
    const sched = allScheds[schedId];
    if (!sched) return;
    const d = sched.date;
    if (!dateMap[d]) dateMap[d] = { scheduleJournals: [], dailyJournal: null };
    dateMap[d].scheduleJournals.push({ schedId, sched, journal });
  });

  Object.entries(dailyJournals).forEach(([d, journal]) => {
    if (!dateMap[d]) dateMap[d] = { scheduleJournals: [], dailyJournal: null };
    dateMap[d].dailyJournal = journal;
  });

  const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

  if (sortedDates.length === 0) {
    return (
      <div className="empty-state">
        <div className="emoji">📭</div>
        <p>아직 기록이 없어요.<br />스케줄에서 느낀점을 남겨보세요!</p>
      </div>
    );
  }

  return (
    <>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, marginBottom: 16 }}>📖 나의 기록</h2>
      {sortedDates.map(dateStr => {
        const d = parseDate(dateStr);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KR[dayIdx]})`;
        const data = dateMap[dateStr];
        const totalEntries = data.scheduleJournals.length + (data.dailyJournal ? 1 : 0);
        const isExpanded = expandedDate === dateStr;

        return (
          <div key={dateStr} style={{ marginBottom: 10 }}>
            <button onClick={() => setExpandedDate(isExpanded ? null : dateStr)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", background: "var(--card)", border: "none", borderRadius: "var(--radius-sm)",
              boxShadow: "var(--shadow)", cursor: "pointer", fontFamily: "var(--font-body)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{label}</span>
                <span style={{ fontSize: 12, color: "var(--text3)", background: "var(--bg)", padding: "2px 8px", borderRadius: 10 }}>
                  {totalEntries}건
                </span>
              </div>
              <span style={{ color: "var(--text3)", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                <ChevronRight size={18} />
              </span>
            </button>

            {isExpanded && (
              <div style={{ padding: "10px 0 4px 0" }}>
                {/* Daily journal */}
                {data.dailyJournal && (
                  <div className="journal-entry" style={{ marginBottom: 10 }}>
                    <div className="journal-entry-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent2)" }}>✨ 오늘의 느낀점</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {(data.dailyJournal.hasVoice || data.dailyJournal.audioURL) && <MicIcon size={12} color="var(--accent)" />}
                          {(data.dailyJournal.hasText || data.dailyJournal.text) && <TextIcon size={12} color="var(--accent3)" />}
                        </div>
                      </div>
                      {confirmDeleteId === "daily_" + dateStr ? (
                        <button onClick={() => { onDeleteDailyJournal(dateStr); setConfirmDeleteId(null); }}
                          style={{ fontSize: 11, color: "#ff4757", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>삭제 확인</button>
                      ) : (
                        <button onClick={() => setConfirmDeleteId("daily_" + dateStr)}
                          style={{ color: "var(--text3)", background: "none", border: "none", cursor: "pointer" }}><TrashIcon size={14} /></button>
                      )}
                    </div>
                    {data.dailyJournal.audioURL && (
                      <SafeAudioPlayer src={data.dailyJournal.audioURL} style={{ marginBottom: 6 }} />
                    )}
                    {data.dailyJournal.voiceText && (
                      <div className="journal-entry-text" style={{ fontSize: 13, marginBottom: 4, color: "var(--text2)" }}>🎙 {data.dailyJournal.voiceText}</div>
                    )}
                    {data.dailyJournal.text && (
                      <div className="journal-entry-text" style={{ fontSize: 13 }}>{data.dailyJournal.text}</div>
                    )}
                  </div>
                )}

                {/* Schedule journals */}
                {data.scheduleJournals.map(({ schedId, sched, journal }) => (
                  <div key={schedId} className="journal-entry" style={{ marginBottom: 10 }}>
                    <div className="journal-entry-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: getColor(sched.colorIdx || 0), flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{sched.title}</span>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>{formatTime(sched.startH, sched.startM)}-{formatTime(sched.endH, sched.endM)}</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {(journal.hasVoice || journal.audioURL) && <MicIcon size={12} color="var(--accent)" />}
                          {(journal.hasText || journal.text) && <TextIcon size={12} color="var(--accent3)" />}
                        </div>
                      </div>
                      {confirmDeleteId === schedId ? (
                        <button onClick={() => { onDeleteJournal(schedId); setConfirmDeleteId(null); }}
                          style={{ fontSize: 11, color: "#ff4757", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>삭제 확인</button>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(schedId)}
                          style={{ color: "var(--text3)", background: "none", border: "none", cursor: "pointer" }}><TrashIcon size={14} /></button>
                      )}
                    </div>
                    {journal.audioURL && (
                      <SafeAudioPlayer src={journal.audioURL} style={{ marginBottom: 6 }} />
                    )}
                    {journal.voiceText && (
                      <div className="journal-entry-text" style={{ fontSize: 13, marginBottom: 4, color: "var(--text2)" }}>🎙 {journal.voiceText}</div>
                    )}
                    {journal.text && (
                      <div className="journal-entry-text" style={{ fontSize: 13 }}>{journal.text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Time Picker Row (reusable) ───
function TimePickerRow({ label, startH, startM, endH, endM, onChange }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 4, fontFamily: "var(--font-display)", fontSize: 15 }}>{label}</div>}
      <div className="form-row" style={{ gap: 4 }}>
        <select className="form-input" style={{ padding: "7px 4px", fontSize: 13 }} value={startH} onChange={e => onChange({ startH: +e.target.value, startM, endH, endM })}>
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}시</option>)}
        </select>
        <select className="form-input" style={{ padding: "7px 4px", fontSize: 13 }} value={startM} onChange={e => onChange({ startH, startM: +e.target.value, endH, endM })}>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i * 5}>{String(i * 5).padStart(2, "0")}분</option>)}
        </select>
        <span style={{ alignSelf: "center", color: "var(--text3)", fontSize: 13 }}>~</span>
        <select className="form-input" style={{ padding: "7px 4px", fontSize: 13 }} value={endH} onChange={e => onChange({ startH, startM, endH: +e.target.value, endM })}>
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}시</option>)}
        </select>
        <select className="form-input" style={{ padding: "7px 4px", fontSize: 13 }} value={endM} onChange={e => onChange({ startH, startM, endH, endM: +e.target.value })}>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i * 5}>{String(i * 5).padStart(2, "0")}분</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Default Setup Modal ───
function DefaultSetupModal({ defaults, onSave, onClose }) {
  const [items, setItems] = useState(defaults.length ? defaults.map(d => ({ ...d })) : []);
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState(-1);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState([]);
  // dayTimes: { 0: {startH, startM, endH, endM}, 1: {...}, ... }
  const [dayTimes, setDayTimes] = useState({});

  const defaultTime = { startH: 9, startM: 0, endH: 10, endM: 0 };

  const resetForm = () => {
    setTitle(""); setDays([]); setDayTimes({});
    setEditIdx(-1); setShowForm(false);
  };

  const openEdit = (idx) => {
    const it = items[idx];
    setTitle(it.title);
    setDays([...it.days]);
    // Migrate old format (single time) to per-day format
    if (it.dayTimes) {
      setDayTimes({ ...it.dayTimes });
    } else {
      const migrated = {};
      it.days.forEach(d => {
        migrated[d] = { startH: it.startH ?? 9, startM: it.startM ?? 0, endH: it.endH ?? 10, endM: it.endM ?? 0 };
      });
      setDayTimes(migrated);
    }
    setEditIdx(idx); setShowForm(true);
  };

  const toggleDay = (d) => {
    setDays(prev => {
      if (prev.includes(d)) {
        const next = prev.filter(x => x !== d);
        setDayTimes(pt => { const n = { ...pt }; delete n[d]; return n; });
        return next;
      } else {
        // When adding a new day, copy time from the last added day or use default
        const lastDay = prev.length > 0 ? prev[prev.length - 1] : null;
        const copyFrom = lastDay !== null && dayTimes[lastDay] ? { ...dayTimes[lastDay] } : { ...defaultTime };
        setDayTimes(pt => ({ ...pt, [d]: copyFrom }));
        return [...prev, d].sort((a, b) => a - b);
      }
    });
  };

  const updateDayTime = (dayIdx, timeObj) => {
    setDayTimes(prev => ({ ...prev, [dayIdx]: timeObj }));
  };

  const applyTimeToAll = (sourceDayIdx) => {
    const source = dayTimes[sourceDayIdx];
    if (!source) return;
    setDayTimes(prev => {
      const next = { ...prev };
      days.forEach(d => { next[d] = { ...source }; });
      return next;
    });
  };

  const saveItem = () => {
    if (!title.trim() || days.length === 0) return;
    const item = { title: title.trim(), days, dayTimes: { ...dayTimes } };
    if (editIdx >= 0) {
      const next = [...items]; next[editIdx] = item; setItems(next);
    } else {
      setItems([...items, item]);
    }
    resetForm();
  };

  const deleteItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // Helper: summarize times for display in list
  const summarizeTimes = (it) => {
    const dt = it.dayTimes;
    if (!dt) return `${formatTime(it.startH, it.startM)}-${formatTime(it.endH, it.endM)}`;
    const timeStrings = it.days.map(d => {
      const t = dt[d];
      return t ? `${formatTime(t.startH, t.startM)}-${formatTime(t.endH, t.endM)}` : "";
    });
    const unique = [...new Set(timeStrings)];
    if (unique.length === 1) return unique[0];
    // Different times → show per day
    return it.days.map(d => {
      const t = dt[d];
      return t ? `${DAYS_KR[d]} ${formatTime(t.startH, t.startM)}-${formatTime(t.endH, t.endM)}` : "";
    }).filter(Boolean).join(" / ");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3>⚙️ 기본 시간표 설정</h3>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
          매주 반복되는 기본 스케줄을 설정하세요.<br />요일마다 다른 시간을 지정할 수 있어요.
        </p>

        {items.map((it, idx) => (
          <div key={idx} className="sched-item" style={{ alignItems: "flex-start" }}>
            <div className="color-dot" style={{ background: getColor(idx), marginTop: 4 }} />
            <div className="sched-info">
              <div className="sched-title">{it.title}</div>
              <div className="sched-meta" style={{ lineHeight: 1.5 }}>
                {it.days.map(d => DAYS_KR[d]).join(", ")}<br />
                {summarizeTimes(it)}
              </div>
            </div>
            <div className="sched-actions">
              <button onClick={() => openEdit(idx)}><PenIcon /></button>
              <button onClick={() => deleteItem(idx)}><TrashIcon /></button>
            </div>
          </div>
        ))}

        {showForm ? (
          <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: 14, marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">제목</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 수학 학원" />
            </div>
            <div className="form-group">
              <label className="form-label">요일 선택</label>
              <div style={{ display: "flex", gap: 6 }}>
                {DAYS_KR.map((d, i) => (
                  <button key={i} onClick={() => toggleDay(i)} style={{
                    width: 36, height: 36, borderRadius: "50%",
                    border: days.includes(i) ? "2px solid var(--accent)" : "2px solid var(--border)",
                    background: days.includes(i) ? "var(--accent)" : "var(--card)",
                    color: days.includes(i) ? "#fff" : "var(--text2)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "var(--font-body)",
                  }}>{d}</button>
                ))}
              </div>
            </div>

            {days.length > 0 && (
              <div className="form-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>요일별 시간 설정</label>
                  {days.length > 1 && (
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => applyTimeToAll(days[0])}
                    >
                      첫 번째 시간으로 전체 적용
                    </button>
                  )}
                </div>
                <div style={{
                  background: "var(--card)",
                  borderRadius: "var(--radius-sm)",
                  padding: 10,
                  border: "1px solid var(--border)",
                }}>
                  {days.map((d, i) => {
                    const t = dayTimes[d] || defaultTime;
                    return (
                      <TimePickerRow
                        key={d}
                        label={`${DAYS_KR[d]}요일`}
                        startH={t.startH}
                        startM={t.startM}
                        endH={t.endH}
                        endM={t.endM}
                        onChange={(newT) => updateDayTime(d, newT)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={resetForm}>취소</button>
              <button className="btn btn-primary btn-sm" onClick={saveItem}>{editIdx >= 0 ? "수정" : "추가"}</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-block" onClick={() => setShowForm(true)} style={{ marginTop: 12 }}>
            <PlusIcon size={16} /> &nbsp;기본 스케줄 추가
          </button>
        )}

        <button className="btn btn-primary btn-block" onClick={() => onSave(items)} style={{ marginTop: 16 }}>
          저장하기
        </button>
      </div>
    </div>
  );
}
