import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  collection, getDocs, orderBy, query, doc, updateDoc,
  addDoc, serverTimestamp, where, limit, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { PaymentStatus, Appointment, AppointmentStatus } from '@/types'
import toast from 'react-hot-toast'

// ─── Extended Types ───────────────────────────────────────────────────────────

interface AppointmentExtended extends Appointment {
  notes?: string
  consultationNotes?: string
  followUpDate?: string
  followUpRequired?: boolean
  reminderSent?: boolean
  checkedIn?: boolean
  checkedInAt?: string
  updatedAt?: string | { toDate(): Date }
  tags?: string[]
  priority?: 'normal' | 'urgent'
  visitType?: 'first' | 'followup' | 'emergency'
  // Demographics
  age?: number
  gender?: 'male' | 'female' | 'other'
  bloodGroup?: string
  // Address & Identity
  patientId?: string          // auto-generated ref e.g. UBH-000123
  address?: string
  city?: string
  pincode?: string
  // Medical profile
  emergencyContact?: string   // name + phone
  knownConditions?: string    // hypertension, diabetes, etc.
  currentMedications?: string
  allergies?: string
  referredBy?: string         // referring doctor / self
  // Appointment
  rescheduledFrom?: string
  cancelReason?: string
  appointmentFee?: number
  prescriptionUrl?: string
}

interface PatientHint {
  name: string
  phone: string
  email: string
  visitCount?: number
  age?: number
  gender?: string
  bloodGroup?: string
}

type FilterStatus = 'all' | AppointmentStatus
type ViewMode = 'table' | 'calendar' | 'kanban' | 'timeline'
type SortKey = 'createdAt' | 'preferredDate' | 'patientName' | 'status'
type SortDir = 'asc' | 'desc'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppointmentStatus, { color: string; dot: string; label: string; icon: string; bg: string }> = {
  pending:   { color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',   label: 'Pending',   icon: '⏳', bg: 'bg-amber-50'   },
  confirmed: { color: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500',    label: 'Confirmed', icon: '✓',  bg: 'bg-blue-50'    },
  completed: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Completed', icon: '✔✔', bg: 'bg-emerald-50' },
  cancelled: { color: 'bg-red-50 text-red-600 border-red-200',             dot: 'bg-red-400',     label: 'Cancelled', icon: '✕',  bg: 'bg-red-50'     },
}

const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
]

const REASONS = [
  'General Cardiology Consultation',
  'Follow-up Visit',
  'ECG / Echocardiogram',
  'Chest Pain / Palpitations',
  'Hypertension Management',
  'Post-surgery Follow-up',
  'Report Review',
  'Second Opinion',
  'Other',
]

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const FILTER_TABS: { label: string; value: FilterStatus }[] = [
  { label: 'All',       value: 'all'       },
  { label: 'Pending',   value: 'pending'   },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const REMINDER_TEMPLATES = {
  sms: (name: string, date: string, time: string) =>
    `Dear ${name}, your appointment with Dr. [Name] is confirmed for ${date} at ${time}. Please arrive 10 mins early. For queries: [Phone]. - UpBeat Heart`,
  whatsapp: (name: string, date: string, time: string) =>
    `Hello ${name} 👋\n\nYour cardiology appointment is confirmed:\n📅 Date: ${date}\n⏰ Time: ${time}\n📍 CARE Hospital\n\nPlease bring previous reports and arrive 10 minutes early.\n\nFor any queries, call us at [Phone].\n\n❤️ UpBeat Heart`,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string | { toDate(): Date } | null | undefined) {
  if (!iso) return '—'
  const d = typeof iso === 'object' && 'toDate' in iso ? iso.toDate() : new Date(iso as string)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function slotTaken(slots: AppointmentExtended[], date: string, time: string, excludeId?: string) {
  return slots.some(a => a.preferredDate === date && a.preferredTime === time
    && (a.status === 'pending' || a.status === 'confirmed') && a.id !== excludeId)
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(name: string) {
  const colors = [
    'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700',
    'bg-emerald-100 text-emerald-700', 'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700',
  ]
  return colors[name.charCodeAt(0) % colors.length]
}

async function printReceipt(appt: AppointmentExtended) {
  // Fetch branding & doctor info from settings/site
  let logoUrl = ''; let doctorName = 'Consultant Cardiologist'; let hospitalName = 'CARE Hospitals'
  let hospitalAddress = ''; let phone = ''; let siteTitle = 'UpBeat Heart'; let doctorTitle = 'Consultant Cardiologist'
  try {
    const { doc: fsDoc, getDoc: fsGetDoc } = await import('firebase/firestore')
    const { db: fsDb } = await import('@/lib/firebase')
    const snap = await fsGetDoc(fsDoc(fsDb, 'settings', 'site'))
    if (snap.exists()) {
      const d = snap.data()
      logoUrl         = d.logoUrl         || ''
      doctorName      = d.doctorName      || 'Doctor'
      doctorTitle     = d.doctorTitle     || 'Consultant Cardiologist'
      hospitalName    = d.hospitalName    || 'CARE Hospitals'
      hospitalAddress = d.hospitalAddress || d.address || ''
      phone           = d.phone           || ''
      siteTitle       = d.siteTitle       || 'UpBeat Heart'
    }
  } catch { /* use defaults */ }

  const statusColors: Record<string, string> = {
    confirmed: '#0369a1', completed: '#059669', pending: '#d97706', cancelled: '#dc2626'
  }
  const statusColor = statusColors[appt.status] || '#1565C0'
  const refNo = (appt.patientId || `UBH-${appt.id.slice(0,6).toUpperCase()}`)
  const visitLabel = appt.visitType === 'first' ? 'First Consultation' : appt.visitType === 'followup' ? 'Follow-up Visit' : 'Emergency Consultation'

  const w = window.open('', '_blank')
  if (!w) return

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${siteTitle}" style="max-height:52px;max-width:200px;object-fit:contain;display:block;margin:0 auto 6px" />`
    : `<div style="font-size:26px;font-weight:900;color:#1565C0;letter-spacing:-0.5px">❤️ ${siteTitle}</div>`

  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Appointment – ${appt.patientName} · ${refNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    background: #f8fafc;
    color: #0f172a;
    min-height: 100vh;
    padding: 32px 20px;
  }
  .page {
    max-width: 680px;
    margin: 0 auto;
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  /* Header band */
  .header {
    background: linear-gradient(135deg, #1565C0 0%, #0d47a1 100%);
    padding: 28px 36px 24px;
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content: '';
    position: absolute;
    right: -40px; top: -40px;
    width: 180px; height: 180px;
    border-radius: 50%;
    background: rgba(255,255,255,0.07);
  }
  .header::before {
    content: '';
    position: absolute;
    right: 40px; bottom: -60px;
    width: 120px; height: 120px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .logo-wrap { }
  .receipt-title {
    text-align: right;
  }
  .receipt-title .label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .receipt-title .ref {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  .status-banner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 100px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.9;
  }
  /* Appointment highlight bar */
  .appt-bar {
    background: rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 12px 16px;
    margin-top: 16px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .appt-bar-item .al { font-size: 10px; font-weight: 600; opacity: 0.65; text-transform: uppercase; letter-spacing: 1px; }
  .appt-bar-item .av { font-size: 15px; font-weight: 700; margin-top: 2px; }
  /* Body */
  .body { padding: 28px 36px; }
  /* Section */
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #1565C0;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1.5px solid #e0f0ff;
  }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .field { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .field:last-child { border-bottom: none; }
  .field .fl { font-size: 11px; color: #64748b; font-weight: 500; margin-bottom: 2px; }
  .field .fv { font-size: 13px; color: #0f172a; font-weight: 600; }
  .field .fv.muted { color: #94a3b8; font-weight: 400; }
  /* Badges */
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-payment-paid    { background: #dcfce7; color: #15803d; }
  .badge-payment-unpaid  { background: #fef3c7; color: #b45309; }
  .badge-priority-urgent { background: #fee2e2; color: #b91c1c; }
  /* Watermark */
  .verified-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    padding: 10px 14px;
    margin-top: 6px;
  }
  .verified-icon { font-size: 16px; }
  .verified-text { font-size: 12px; color: #15803d; font-weight: 600; }
  /* Footer */
  .footer {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 18px 36px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }
  .footer-note { font-size: 11px; color: #94a3b8; line-height: 1.6; }
  .footer-note strong { color: #64748b; }
  .footer-brand { text-align: right; font-size: 11px; color: #94a3b8; }
  .footer-brand strong { color: #1565C0; font-size: 12px; }
  /* Print */
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; border-radius: 0; max-width: 100%; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-top">
      <div class="logo-wrap">${logoHtml}</div>
      <div class="receipt-title">
        <div class="label">Reference No.</div>
        <div class="ref">${refNo}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="status-banner"><span class="status-dot"></span>${appt.status.toUpperCase()}</span>
      ${appt.priority === 'urgent' ? '<span class="status-banner" style="background:rgba(239,68,68,0.25);border-color:rgba(239,68,68,0.4)">🚨 URGENT</span>' : ''}
      ${appt.visitType ? `<span class="status-banner">${visitLabel}</span>` : ''}
    </div>
    <div class="appt-bar">
      <div class="appt-bar-item">
        <div class="al">Date</div>
        <div class="av">${formatDate(appt.preferredDate)}</div>
      </div>
      <div class="appt-bar-item">
        <div class="al">Time</div>
        <div class="av">${appt.preferredTime}</div>
      </div>
      <div class="appt-bar-item">
        <div class="al">Consulting Doctor</div>
        <div class="av">${doctorName || 'Dr. —'}</div>
      </div>
      <div class="appt-bar-item">
        <div class="al">Hospital</div>
        <div class="av">${hospitalName}</div>
      </div>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    <!-- Patient Information -->
    <div class="section">
      <div class="section-title">Patient Information</div>
      <div class="grid2">
        <div class="field">
          <div class="fl">Full Name</div>
          <div class="fv">${appt.patientName}</div>
        </div>
        <div class="field">
          <div class="fl">Patient ID</div>
          <div class="fv">${refNo}</div>
        </div>
        <div class="field">
          <div class="fl">Phone</div>
          <div class="fv">${appt.patientPhone || '—'}</div>
        </div>
        <div class="field">
          <div class="fl">Email</div>
          <div class="fv ${!appt.patientEmail ? 'muted' : ''}">${appt.patientEmail || '—'}</div>
        </div>
        ${appt.age ? `
        <div class="field">
          <div class="fl">Age</div>
          <div class="fv">${appt.age} years</div>
        </div>` : ''}
        ${appt.gender ? `
        <div class="field">
          <div class="fl">Gender</div>
          <div class="fv" style="text-transform:capitalize">${appt.gender}</div>
        </div>` : ''}
        ${appt.bloodGroup ? `
        <div class="field">
          <div class="fl">Blood Group</div>
          <div class="fv" style="color:#b91c1c">${appt.bloodGroup}</div>
        </div>` : ''}
        ${appt.address ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Address</div>
          <div class="fv">${appt.address}${appt.city ? ', ' + appt.city : ''}${appt.pincode ? ' – ' + appt.pincode : ''}</div>
        </div>` : ''}
        ${appt.emergencyContact ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Emergency Contact</div>
          <div class="fv">${appt.emergencyContact}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Medical Profile -->
    ${(appt.knownConditions || appt.currentMedications || appt.allergies || appt.referredBy) ? `
    <div class="section">
      <div class="section-title">Medical Profile</div>
      <div class="grid2">
        ${appt.knownConditions ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Known Conditions</div>
          <div class="fv">${appt.knownConditions}</div>
        </div>` : ''}
        ${appt.allergies ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Allergies</div>
          <div class="fv" style="color:#b91c1c">${appt.allergies}</div>
        </div>` : ''}
        ${appt.currentMedications ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Current Medications</div>
          <div class="fv">${appt.currentMedications}</div>
        </div>` : ''}
        ${appt.referredBy ? `
        <div class="field">
          <div class="fl">Referred By</div>
          <div class="fv">${appt.referredBy}</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Appointment Details -->
    <div class="section">
      <div class="section-title">Appointment Details</div>
      <div class="grid2">
        <div class="field">
          <div class="fl">Reason for Visit</div>
          <div class="fv">${appt.reason}</div>
        </div>
        <div class="field">
          <div class="fl">Visit Type</div>
          <div class="fv">${visitLabel}</div>
        </div>
        <div class="field">
          <div class="fl">Appointment Status</div>
          <div class="fv" style="color:${statusColor}">${appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}</div>
        </div>
        <div class="field">
          <div class="fl">Check-in</div>
          <div class="fv ${!appt.checkedIn ? 'muted' : ''}">${appt.checkedIn ? '✓ Checked In' : 'Not yet'}</div>
        </div>
        <div class="field">
          <div class="fl">Payment</div>
          <div class="fv">
            <span class="badge ${appt.paymentStatus === 'paid' ? 'badge-payment-paid' : 'badge-payment-unpaid'}">
              ${appt.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Pending'}
            </span>
          </div>
        </div>
        ${appt.appointmentFee ? `
        <div class="field">
          <div class="fl">Consultation Fee</div>
          <div class="fv">₹${appt.appointmentFee}</div>
        </div>` : ''}
        ${appt.rescheduledFrom ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Rescheduled From</div>
          <div class="fv" style="color:#d97706">${appt.rescheduledFrom}</div>
        </div>` : ''}
        ${appt.notes ? `
        <div class="field" style="grid-column:span 2">
          <div class="fl">Admin Notes</div>
          <div class="fv" style="font-weight:400;color:#475569">${appt.notes}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Verified by doctor -->
    <div class="verified-bar">
      <div class="verified-icon">🩺</div>
      <div>
        <div class="verified-text">Appointment confirmed by ${doctorName || 'Doctor'} · ${doctorTitle}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${hospitalName}${hospitalAddress ? ' · ' + hospitalAddress : ''}</div>
      </div>
    </div>

  </div><!-- /body -->

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-note">
      <strong>Please arrive 10 minutes early</strong> and bring all previous medical reports &amp; prescriptions.<br/>
      ${phone ? `📞 ${phone}` : ''} ${hospitalAddress ? '· ' + hospitalAddress : ''}
    </div>
    <div class="footer-brand">
      <strong>${siteTitle}</strong><br/>
      ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · upbeatheart.com
    </div>
  </div>

</div><!-- /page -->
<script>
  window.addEventListener('load', () => {
    // Small delay to let Google Font load
    setTimeout(() => window.print(), 600)
  })
</script>
</body>
</html>`)
  w.document.close()
}

// ─── Icon Components ──────────────────────────────────────────────────────────

const Icon = {
  Calendar:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  Table:        () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 6h4m-4 12h4M3 6h4M3 18h4m14-12h-4m4 12h-4"/></svg>,
  Kanban:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>,
  Timeline:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Phone:        () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>,
  Mail:         () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  Close:        () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>,
  Search:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>,
  ChevronLeft:  () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>,
  ChevronRight: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>,
  Clock:        () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Bell:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>,
  CheckIn:      () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Export:       () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>,
  Urgent:       () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>,
  FollowUp:     () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>,
  Print:        () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>,
  Copy:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
  Reschedule:   () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2 2 4-4"/></svg>,
  History:      () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Sort:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg>,
  Whatsapp:     () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.123 1.527 5.858L.057 23.887a.5.5 0 00.609.678l6.214-1.438A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.903 0-3.68-.528-5.2-1.443l-.373-.222-3.868.896.924-3.768-.242-.386A9.958 9.958 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>,
  User:         () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  Checkbox:     ({ checked }: { checked: boolean }) => checked
    ? <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    : <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2}/></svg>,
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(appointments: AppointmentExtended[], label = 'appointments') {
  const headers = ['Name', 'Phone', 'Email', 'Age', 'Gender', 'Blood Group', 'Date', 'Time', 'Reason', 'Status', 'Payment', 'Priority', 'Visit Type', 'Checked In', 'Fee', 'Booked At']
  const rows = appointments.map(a => [
    a.patientName, a.patientPhone, a.patientEmail, a.age ?? '', a.gender ?? '', a.bloodGroup ?? '',
    a.preferredDate, a.preferredTime, a.reason, a.status, a.paymentStatus,
    a.priority ?? 'normal', a.visitType ?? 'first', a.checkedIn ? 'Yes' : 'No',
    a.appointmentFee ?? '', new Date(a.createdAt).toLocaleString('en-IN'),
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${label}-${getTodayString()}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.success('Exported successfully')
}

// ─── Add Appointment Modal ────────────────────────────────────────────────────

interface AddModalProps {
  onClose: () => void
  onAdded: (apt: AppointmentExtended) => void
  existingAppointments: AppointmentExtended[]
}

function AddAppointmentModal({ onClose, onAdded, existingAppointments }: AddModalProps) {
  const [patientName, setPatientName]   = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [patientEmail, setPatientEmail] = useState('')
  const [age, setAge]                   = useState('')
  const [gender, setGender]             = useState<'male' | 'female' | 'other' | ''>('')
  const [bloodGroup, setBloodGroup]     = useState('')
  const [date, setDate]                 = useState(getTodayString())
  const [time, setTime]                 = useState('')
  const [reason, setReason]             = useState('')
  const [customReason, setCustomReason] = useState('')
  const [notes, setNotes]               = useState('')
  const [fee, setFee]                   = useState('')
  const [priority, setPriority]         = useState<'normal' | 'urgent'>('normal')
  const [visitType, setVisitType]       = useState<'first' | 'followup' | 'emergency'>('first')
  const [saving, setSaving]             = useState(false)
  const [hints, setHints]               = useState<PatientHint[]>([])
  const [showHints, setShowHints]       = useState(false)
  const [lookingUp, setLookingUp]       = useState(false)
  const [existingMatch, setExistingMatch] = useState<PatientHint | null>(null)
  const [slotConflict, setSlotConflict] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function searchPatients(term: string) {
    if (term.length < 3) { setHints([]); return }
    setLookingUp(true)
    try {
      const snap = await getDocs(query(collection(db, 'appointments'),
        where('patientPhone', '>=', term), where('patientPhone', '<=', term + '\uf8ff'), limit(5)))
      const seen = new Set<string>()
      const results: PatientHint[] = []
      snap.docs.forEach(d => {
        const data = d.data() as AppointmentExtended
        if (!seen.has(data.patientPhone)) {
          seen.add(data.patientPhone)
          results.push({ name: data.patientName, phone: data.patientPhone, email: data.patientEmail, age: data.age, gender: data.gender, bloodGroup: data.bloodGroup })
        }
      })
      setHints(results); setShowHints(results.length > 0)
    } finally { setLookingUp(false) }
  }

  function onPhoneChange(val: string) {
    setPatientPhone(val); setExistingMatch(null)
    clearTimeout(debounceRef.current!)
    debounceRef.current = setTimeout(() => searchPatients(val), 400)
  }

  function pickHint(h: PatientHint) {
    setPatientName(h.name); setPatientPhone(h.phone); setPatientEmail(h.email)
    if (h.age) setAge(String(h.age))
    if (h.gender) setGender(h.gender as 'male' | 'female' | 'other')
    if (h.bloodGroup) setBloodGroup(h.bloodGroup)
    setExistingMatch(h); setHints([]); setShowHints(false); setVisitType('followup')
  }

  useEffect(() => {
    setSlotConflict(date && time ? slotTaken(existingAppointments, date, time) : false)
  }, [date, time, existingAppointments])

  async function handleSubmit() {
    if (!patientName.trim() || !patientPhone.trim() || !date || !time || !reason) {
      toast.error('Please fill all required fields'); return
    }
    if (slotConflict) { toast.error('This time slot already has an appointment'); return }
    setSaving(true)
    try {
      const finalReason = reason === 'Other' ? customReason.trim() || 'Other' : reason
      const payload: Record<string, unknown> = {
        patientName: patientName.trim(), patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim(), preferredDate: date, preferredTime: time,
        reason: finalReason, notes: notes.trim(), reports: [] as string[],
        status: 'pending' as AppointmentStatus, paymentStatus: 'unpaid' as PaymentStatus,
        razorpayOrderId: '', priority, visitType, checkedIn: false, reminderSent: false,
        createdAt: new Date().toISOString(),
      }
      if (age) payload.age = Number(age)
      if (gender) payload.gender = gender
      if (bloodGroup) payload.bloodGroup = bloodGroup
      if (fee) payload.appointmentFee = Number(fee)
      const { id: apptId } = await addDoc(collection(db, 'appointments'), payload)
      const added: AppointmentExtended = {
        id: apptId, patientName: patientName.trim(), patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim(), preferredDate: date, preferredTime: time,
        reason: finalReason, notes: notes.trim(), reports: [], status: 'pending',
        paymentStatus: 'unpaid', razorpayOrderId: '', priority, visitType,
        checkedIn: false, reminderSent: false, createdAt: new Date().toISOString(),
        age: age ? Number(age) : undefined, gender: gender || undefined,
        bloodGroup: bloodGroup || undefined, appointmentFee: fee ? Number(fee) : undefined,
      }
      toast.success('Appointment booked successfully')
      onAdded(added); onClose()
    } catch (err) { console.error(err); toast.error('Failed to book appointment') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-w-[95vw] max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Book New Appointment</h2>
            <p className="text-xs text-gray-400 mt-0.5">All fields marked * are required</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition">
            <Icon.Close />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Priority & Visit Type */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Priority</label>
              <div className="flex gap-2">
                {(['normal', 'urgent'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white border-red-500' : 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {p === 'urgent' ? '🚨 Urgent' : '🟢 Normal'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Visit Type</label>
              <div className="flex gap-2">
                {(['first', 'followup', 'emergency'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setVisitType(v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition capitalize ${visitType === v
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {v === 'first' ? '1st Visit' : v === 'followup' ? 'Follow-up' : '🚑 Emergency'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Patient Details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Patient Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Patient Name *</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Full name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone *</label>
                <input value={patientPhone} onChange={e => onPhoneChange(e.target.value)} placeholder="+91 9876543210"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                {lookingUp && <span className="absolute right-3 top-8 text-xs text-gray-400">Searching…</span>}
                {showHints && hints.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 mt-1 divide-y divide-gray-50">
                    {hints.map(h => (
                      <button key={h.phone} type="button" onClick={() => pickHint(h)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition">
                        <p className="font-medium text-gray-800">{h.name}</p>
                        <p className="text-xs text-gray-400">{h.phone} · {h.age ? `${h.age}y` : ''} {h.bloodGroup ?? ''} · Returning patient</p>
                      </button>
                    ))}
                  </div>
                )}
                {existingMatch && <p className="text-xs text-green-600 mt-1">✓ Returning patient — auto-filled</p>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                <input value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="email" type="email"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Age (years)</label>
                <input value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 52" type="number" min={1} max={120}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Blood Group</label>
                <select value={bloodGroup} onChange={e => setBloodGroup(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Gender</label>
              <div className="flex gap-2">
                {(['male', 'female', 'other'] as const).map(g => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition capitalize ${gender === g
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⊕ Other'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} min={getTodayString()}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Time Slot *</label>
                <select value={time} onChange={e => setTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select time</option>
                  {TIME_SLOTS.map(t => {
                    const booked = slotTaken(existingAppointments, date, t)
                    return <option key={t} value={t} disabled={booked}>{booked ? `${t} — Booked` : t}</option>
                  })}
                </select>
                {slotConflict && <p className="text-xs text-red-500 mt-1">⚠ This slot is already booked</p>}
              </div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Reason for Visit *</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${reason === r
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:border-primary/40'}`}>
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Other' && (
              <input value={customReason} onChange={e => setCustomReason(e.target.value)} placeholder="Describe the reason…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mt-2" />
            )}
          </div>

          {/* Fee & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Appointment Fee (₹)</label>
              <input value={fee} onChange={e => setFee(e.target.value)} placeholder="e.g. 800" type="number" min={0}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Admin Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Medications, medical history, special requirements…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6 border-t border-gray-50 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? 'Booking…' : '+ Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Appointment Detail Drawer ────────────────────────────────────────────────

interface DrawerProps {
  appointment: AppointmentExtended
  allAppointments: AppointmentExtended[]
  onClose: () => void
  onUpdate: (id: string, data: Partial<AppointmentExtended>) => void
}

function AppointmentDrawer({ appointment: appt, allAppointments, onClose, onUpdate }: DrawerProps) {
  const [status, setStatus]             = useState<AppointmentStatus>(appt.status)
  const [payStatus, setPayStatus]       = useState<PaymentStatus>(appt.paymentStatus)
  const [consultNotes, setConsultNotes] = useState(appt.consultationNotes ?? '')
  const [followUpDate, setFollowUpDate] = useState(appt.followUpDate ?? '')
  const [followUpReq, setFollowUpReq]   = useState(appt.followUpRequired ?? false)
  const [cancelReason, setCancelReason] = useState(appt.cancelReason ?? '')
  const [fee, setFee]                   = useState(appt.appointmentFee ? String(appt.appointmentFee) : '')
  const [saving, setSaving]             = useState(false)
  const [tab, setTab]                   = useState<'details' | 'notes' | 'followup' | 'history' | 'reminder'>('details')
  // Reschedule
  const [rescheduleMode, setRescheduleMode] = useState(false)
  const [newDate, setNewDate]               = useState(appt.preferredDate)
  const [newTime, setNewTime]               = useState(appt.preferredTime)
  const [rescheduling, setRescheduling]     = useState(false)

  // Patient history
  const patientHistory = useMemo(() =>
    allAppointments
      .filter(a => a.patientPhone === appt.patientPhone && a.id !== appt.id)
      .sort((a, b) => new Date(b.preferredDate).getTime() - new Date(a.preferredDate).getTime()),
    [allAppointments, appt.patientPhone, appt.id]
  )

  async function save() {
    setSaving(true)
    try {
      const nowISO = new Date().toISOString()
      const localUpdates: Partial<AppointmentExtended> = {
        status, paymentStatus: payStatus, consultationNotes: consultNotes.trim(),
        followUpDate, followUpRequired: followUpReq,
        updatedAt: nowISO,
      }
      if (status === 'cancelled') localUpdates.cancelReason = cancelReason.trim()
      if (fee) localUpdates.appointmentFee = Number(fee)
      // Build Firestore payload — omit undefined so Firestore doesn't reject
      const firestorePayload: Record<string, unknown> = {
        status, paymentStatus: payStatus,
        consultationNotes: consultNotes.trim(),
        followUpDate, followUpRequired: followUpReq,
        updatedAt: serverTimestamp(),
      }
      if (status === 'cancelled') firestorePayload.cancelReason = cancelReason.trim()
      if (fee) firestorePayload.appointmentFee = Number(fee)
      await updateDoc(doc(db, 'appointments', appt.id), firestorePayload)
      onUpdate(appt.id, localUpdates)
      toast.success('Appointment updated')
    } catch (err) { console.error('Save error:', err); toast.error('Update failed') } finally { setSaving(false) }
  }

  async function toggleCheckIn() {
    const now = new Date().toISOString()
    const next = !appt.checkedIn
    await updateDoc(doc(db, 'appointments', appt.id), {
      checkedIn: next, checkedInAt: next ? now : '', updatedAt: serverTimestamp(),
    })
    onUpdate(appt.id, { checkedIn: next, checkedInAt: next ? now : '' })
    toast.success(next ? 'Patient checked in ✓' : 'Check-in reversed')
  }

  async function markReminder() {
    await updateDoc(doc(db, 'appointments', appt.id), { reminderSent: true, updatedAt: serverTimestamp() })
    onUpdate(appt.id, { reminderSent: true })
    toast.success('Reminder marked as sent')
  }

  async function handleReschedule() {
    if (!newDate || !newTime) { toast.error('Select a new date and time'); return }
    if (slotTaken(allAppointments, newDate, newTime, appt.id)) {
      toast.error('That slot is already booked'); return
    }
    setRescheduling(true)
    try {
      const updates = {
        preferredDate: newDate, preferredTime: newTime,
        rescheduledFrom: appt.rescheduledFrom ?? `${appt.preferredDate} ${appt.preferredTime}`,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'appointments', appt.id), updates)
      onUpdate(appt.id, { preferredDate: newDate, preferredTime: newTime, rescheduledFrom: updates.rescheduledFrom })
      toast.success('Appointment rescheduled')
      setRescheduleMode(false)
    } catch { toast.error('Reschedule failed') } finally { setRescheduling(false) }
  }

  function copyReminder(type: 'sms' | 'whatsapp') {
    const text = REMINDER_TEMPLATES[type](appt.patientName, formatDate(appt.preferredDate), appt.preferredTime)
    navigator.clipboard.writeText(text)
    toast.success(`${type === 'sms' ? 'SMS' : 'WhatsApp'} message copied!`)
  }

  const cfg = STATUS_CONFIG[appt.status]

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[500px] bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
              </span>
              {appt.priority === 'urgent' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600">
                  <Icon.Urgent /> Urgent
                </span>
              )}
              {appt.visitType && (
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                  {appt.visitType === 'first' ? '1st Visit' : appt.visitType === 'followup' ? 'Follow-up' : '🚑 Emergency'}
                </span>
              )}
              {appt.rescheduledFrom && (
                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-full">Rescheduled</span>
              )}
            </div>
            <h2 className="font-bold text-gray-900 text-lg">{appt.patientName}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              {appt.reason}
              {appt.age && <span className="text-gray-400">· {appt.age}y</span>}
              {appt.gender && <span className="text-gray-400">· {appt.gender}</span>}
              {appt.bloodGroup && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">{appt.bloodGroup}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition"><Icon.Close /></button>
        </div>

        {/* Quick Actions */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-2 flex-wrap">
          <button onClick={toggleCheckIn}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${appt.checkedIn
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}>
            <Icon.CheckIn /> {appt.checkedIn ? 'Checked In ✓' : 'Check In'}
          </button>
          {!appt.reminderSent ? (
            <button onClick={markReminder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-primary/40 transition">
              <Icon.Bell /> Reminder
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100">
              <Icon.Bell /> Reminder Sent
            </span>
          )}
          <button onClick={() => printReceipt(appt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition">
            <Icon.Print /> Print
          </button>
          <button onClick={() => setRescheduleMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-orange-300 transition">
            <Icon.Reschedule /> Reschedule
          </button>
        </div>

        {/* Reschedule Panel */}
        {rescheduleMode && (
          <div className="mx-6 mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-xs font-semibold text-orange-700 mb-3">Reschedule Appointment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">New Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} min={getTodayString()}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">New Time</label>
                <select value={newTime} onChange={e => setNewTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select</option>
                  {TIME_SLOTS.map(t => {
                    const booked = slotTaken(allAppointments, newDate, t, appt.id)
                    return <option key={t} value={t} disabled={booked}>{booked ? `${t} — Booked` : t}</option>
                  })}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setRescheduleMode(false)}
                className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleReschedule} disabled={rescheduling}
                className="flex-1 py-1.5 text-xs bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50">
                {rescheduling ? 'Rescheduling…' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {([
            { id: 'details', label: 'Details' },
            { id: 'notes', label: 'Notes' },
            { id: 'followup', label: 'Follow-up' },
            { id: 'history', label: `History${patientHistory.length > 0 ? ` (${patientHistory.length})` : ''}` },
            { id: 'reminder', label: 'Reminders' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${tab === t.id
                ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {/* ── Details Tab ── */}
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Patient Contact</p>
                <div className="flex items-center gap-2 text-sm text-gray-700"><Icon.Phone /><span>{appt.patientPhone ?? '—'}</span></div>
                <div className="flex items-center gap-2 text-sm text-gray-700"><Icon.Mail /><span>{appt.patientEmail ?? '—'}</span></div>
                {appt.age && <div className="flex items-center gap-2 text-sm text-gray-700"><Icon.User /><span>{appt.age} years · {appt.gender ?? 'gender not specified'}</span></div>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule</p>
                <div className="flex items-center gap-2 text-sm text-gray-700"><Icon.Calendar /><span>{formatDate(appt.preferredDate)}</span></div>
                <div className="flex items-center gap-2 text-sm text-gray-700"><Icon.Clock /><span>{appt.preferredTime}</span></div>
                {appt.rescheduledFrom && (
                  <p className="text-xs text-orange-600">Originally: {appt.rescheduledFrom}</p>
                )}
              </div>
              {/* Fee */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Appointment Fee (₹)</label>
                <input value={fee} onChange={e => setFee(e.target.value)} type="number" min={0} placeholder="Enter fee amount"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {/* Status */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Update Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['pending', 'confirmed', 'completed', 'cancelled'] as AppointmentStatus[]).map(s => {
                    const c = STATUS_CONFIG[s]
                    return (
                      <button key={s} type="button" onClick={() => setStatus(s)}
                        className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition ${status === s
                          ? `${c.color} border-current/30` : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                        {c.icon} {c.label}
                      </button>
                    )
                  })}
                </div>
                {status === 'cancelled' && (
                  <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                    rows={2} placeholder="Reason for cancellation…"
                    className="w-full border border-red-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none bg-red-50" />
                )}
              </div>
              {/* Payment */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Payment</p>
                <div className="flex gap-2">
                  {(['unpaid', 'paid'] as PaymentStatus[]).map(p => (
                    <button key={p} type="button" onClick={() => setPayStatus(p)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition capitalize ${payStatus === p
                        ? p === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-orange-50 text-orange-700 border-orange-300'
                        : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                      {p === 'paid' ? '✓ Paid' : '⏳ Unpaid'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Admin notes */}
              {appt.notes && (
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-600 mb-1.5">Admin Notes</p>
                  <p className="text-sm text-gray-700">{appt.notes}</p>
                </div>
              )}
              {/* Ref */}
              <p className="text-xs text-gray-300 text-right">Ref: #{appt.id.slice(0, 8).toUpperCase()}</p>
            </div>
          )}

          {/* ── Notes Tab ── */}
          {tab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Consultation Notes</label>
                <p className="text-xs text-gray-400 mb-3">Internal notes — visible to admin and doctor only.</p>
                <textarea value={consultNotes} onChange={e => setConsultNotes(e.target.value)}
                  rows={14} placeholder="Enter diagnoses, prescriptions, observations, clinical findings…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
              {appt.reports && appt.reports.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Uploaded Reports</p>
                  <div className="space-y-2">
                    {appt.reports.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-xl text-sm text-blue-600 hover:bg-blue-50 transition">
                        📄 Report {i + 1}
                        <span className="ml-auto text-xs text-gray-400">View ↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Follow-up Tab ── */}
          {tab === 'followup' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700">Follow-up Required</p>
                  <p className="text-xs text-gray-400 mt-0.5">Schedule a follow-up visit for this patient</p>
                </div>
                <button type="button" onClick={() => setFollowUpReq(!followUpReq)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${followUpReq ? 'bg-primary' : 'bg-gray-200'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${followUpReq ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {followUpReq && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Follow-up Date</label>
                  <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} min={getTodayString()}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {followUpDate && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-center gap-2">
                      <Icon.FollowUp /><span>Follow-up on {formatDate(followUpDate)}</span>
                    </div>
                  )}
                </div>
              )}
              {appt.checkedInAt && (
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-600 mb-1">Check-in Time</p>
                  <p className="text-sm text-gray-700">{new Date(appt.checkedInAt).toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>
          )}

          {/* ── History Tab ── */}
          {tab === 'history' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Patient Visit History · {appt.patientName}
              </p>
              {patientHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">No previous appointments found</p>
                  <p className="text-xs text-gray-300 mt-1">This is the patient's first visit</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {patientHistory.map(h => {
                    const hcfg = STATUS_CONFIG[h.status]
                    return (
                      <div key={h.id} className="border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${hcfg.color}`}>
                              <span className={`w-1 h-1 rounded-full ${hcfg.dot}`} /> {hcfg.label}
                            </span>
                            {h.paymentStatus === 'paid' && <span className="text-xs text-emerald-600">✓ Paid</span>}
                          </div>
                          <span className="text-xs text-gray-400">{formatDate(h.preferredDate)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800">{h.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{h.preferredTime} · {h.visitType === 'first' ? '1st Visit' : h.visitType === 'followup' ? 'Follow-up' : 'Emergency'}</p>
                        {h.consultationNotes && (
                          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 bg-gray-50 p-2 rounded-lg">{h.consultationNotes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Reminder Tab ── */}
          {tab === 'reminder' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message Templates</p>
              <p className="text-xs text-gray-400">Copy and send via your preferred channel.</p>
              {(['sms', 'whatsapp'] as const).map(type => (
                <div key={type} className={`rounded-xl p-4 border ${type === 'whatsapp' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {type === 'whatsapp' ? <Icon.Whatsapp /> : <Icon.Phone />}
                      <span className="text-xs font-semibold text-gray-700 capitalize">{type === 'whatsapp' ? 'WhatsApp' : 'SMS'} Template</span>
                    </div>
                    <button onClick={() => copyReminder(type)}
                      className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition ${type === 'whatsapp' ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                      <Icon.Copy /> Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                    {REMINDER_TEMPLATES[type](appt.patientName, formatDate(appt.preferredDate), appt.preferredTime)}
                  </p>
                </div>
              ))}
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-600 mb-2">Quick Contact</p>
                <p><span className="font-medium">Phone:</span> {appt.patientPhone}</p>
                {appt.patientEmail && <p><span className="font-medium">Email:</span> {appt.patientEmail}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Save Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="w-full py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {appt.updatedAt && (
            <p className="text-xs text-center text-gray-400 mt-2">
              Last updated: {formatDateTime(appt.updatedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ appointments, onSelectAppt }: { appointments: AppointmentExtended[]; onSelectAppt: (a: AppointmentExtended) => void }) {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay    = getFirstDayOfMonth(year, month)
  const monthLabel  = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const todayStr    = getTodayString()

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={prev} className="p-2 hover:bg-gray-100 rounded-xl transition"><Icon.ChevronLeft /></button>
        <h3 className="font-bold text-gray-900">{monthLabel}</h3>
        <button onClick={next} className="p-2 hover:bg-gray-100 rounded-xl transition"><Icon.ChevronRight /></button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const ds = dateStr(day)
          const dayAppts = appointments.filter(a => a.preferredDate === ds)
          const isToday = ds === todayStr
          const hasUrgent = dayAppts.some(a => a.priority === 'urgent')
          return (
            <div key={day} className={`min-h-[80px] rounded-xl p-1.5 border transition ${isToday
              ? 'border-primary/40 bg-primary/5'
              : hasUrgent ? 'border-red-200 bg-red-50/30'
              : dayAppts.length > 0 ? 'border-gray-100 bg-gray-50/50' : 'border-transparent'}`}>
              <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-primary' : 'text-gray-500'}`}>{day}</p>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map(a => {
                  const acfg = STATUS_CONFIG[a.status]
                  return (
                    <button key={a.id} onClick={() => onSelectAppt(a)}
                      className={`w-full text-left px-1.5 py-1 rounded-lg text-xs truncate border ${acfg.color} hover:opacity-80 transition`}>
                      <span className="font-medium">{a.preferredTime?.split(' ')[0]}</span> {a.patientName.split(' ')[0]}
                    </button>
                  )
                })}
                {dayAppts.length > 3 && <p className="text-xs text-gray-400 px-1">+{dayAppts.length - 3} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function KanbanView({ appointments, onSelectAppt }: { appointments: AppointmentExtended[]; onSelectAppt: (a: AppointmentExtended) => void }) {
  const cols: { status: AppointmentStatus; label: string }[] = [
    { status: 'pending', label: 'Pending' }, { status: 'confirmed', label: 'Confirmed' },
    { status: 'completed', label: 'Completed' }, { status: 'cancelled', label: 'Cancelled' },
  ]
  return (
    <div className="grid grid-cols-4 gap-4">
      {cols.map(col => {
        const colAppts = appointments.filter(a => a.status === col.status)
        const cfg = STATUS_CONFIG[col.status]
        return (
          <div key={col.status} className="bg-gray-50/80 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <h4 className="text-sm font-semibold text-gray-700">{col.label}</h4>
              </div>
              <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">{colAppts.length}</span>
            </div>
            <div className="space-y-2">
              {colAppts.map(a => (
                <button key={a.id} onClick={() => onSelectAppt(a)}
                  className="w-full text-left bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:border-primary/30 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(a.patientName)}`}>
                        {getInitials(a.patientName)}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{a.patientName}</p>
                    </div>
                    {a.priority === 'urgent' && <span className="text-red-500 flex-shrink-0"><Icon.Urgent /></span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate mb-2">{a.reason}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-400"><Icon.Calendar /><span>{formatDate(a.preferredDate)}</span></div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5"><Icon.Clock /><span>{a.preferredTime}</span></div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {a.checkedIn && <span className="text-xs text-emerald-600 font-medium">✓ In</span>}
                    {a.paymentStatus === 'unpaid' && a.status !== 'cancelled' && <span className="text-xs text-orange-500">⚠ Unpaid</span>}
                    {a.age && <span className="text-xs text-gray-400">{a.age}y</span>}
                    {a.bloodGroup && <span className="text-xs bg-red-50 text-red-500 px-1 rounded">{a.bloodGroup}</span>}
                  </div>
                </button>
              ))}
              {colAppts.length === 0 && <div className="text-center py-8 text-xs text-gray-400">No appointments</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Today Timeline View ──────────────────────────────────────────────────────

function TimelineView({ appointments, onSelectAppt }: { appointments: AppointmentExtended[]; onSelectAppt: (a: AppointmentExtended) => void }) {
  const todayStr = getTodayString()
  const todayAppts = appointments
    .filter(a => a.preferredDate === todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.preferredTime.localeCompare(b.preferredTime))

  const now = new Date()
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  function parseTime(t: string) {
    const [time, ampm] = t.split(' ')
    let [h, m] = time.split(':').map(Number)
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-gray-900">Today's Schedule</h3>
          <p className="text-xs text-gray-400 mt-0.5">{formatDate(todayStr)} · {todayAppts.length} appointments</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Current time</p>
          <p className="font-bold text-primary">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      {todayAppts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">☀️</p>
          <p className="text-gray-500 font-medium">No appointments today</p>
          <p className="text-sm text-gray-400 mt-1">A clear schedule ahead</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[60px] top-0 bottom-0 w-px bg-gray-100" />
          <div className="space-y-3">
            {todayAppts.map(appt => {
              const t24 = parseTime(appt.preferredTime)
              const isPast = t24 < currentTimeStr
              const isCurrent = t24 >= currentTimeStr && t24 <= `${currentTimeStr.split(':')[0]}:${String(Number(currentTimeStr.split(':')[1]) + 30).padStart(2, '0')}`
              const cfg = STATUS_CONFIG[appt.status]
              return (
                <div key={appt.id} className={`flex items-start gap-4 ${isPast && appt.status === 'pending' ? 'opacity-60' : ''}`}>
                  <div className="w-[52px] text-right flex-shrink-0 pt-2">
                    <p className="text-xs font-bold text-gray-600">{appt.preferredTime.split(' ')[0]}</p>
                    <p className="text-xs text-gray-400">{appt.preferredTime.split(' ')[1]}</p>
                  </div>
                  <div className={`relative flex-shrink-0 mt-3 w-3 h-3 rounded-full border-2 border-white shadow ${cfg.dot} ${isCurrent ? 'ring-2 ring-primary/30 scale-125' : ''}`} />
                  <button onClick={() => onSelectAppt(appt)}
                    className={`flex-1 text-left rounded-xl p-3.5 border transition hover:shadow-md ${isCurrent
                      ? 'border-primary/40 bg-primary/5 shadow-sm'
                      : `border-gray-100 ${cfg.bg}`}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(appt.patientName)}`}>
                          {getInitials(appt.patientName)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{appt.patientName}</p>
                          {appt.age && <p className="text-xs text-gray-400">{appt.age}y{appt.gender ? ` · ${appt.gender}` : ''}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {appt.priority === 'urgent' && <span className="text-red-500"><Icon.Urgent /></span>}
                        {appt.checkedIn && <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">✓ Checked In</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{appt.reason}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {appt.visitType && <span className="text-xs text-gray-400">{appt.visitType === 'first' ? '1st Visit' : appt.visitType === 'followup' ? 'Follow-up' : '🚑 Emergency'}</span>}
                      {appt.paymentStatus === 'unpaid' && <span className="text-xs text-orange-500">⚠ Payment pending</span>}
                      {appt.patientPhone && <span className="text-xs text-gray-400">{appt.patientPhone}</span>}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  count, onStatusChange, onExport, onClear,
}: {
  count: number
  onStatusChange: (status: AppointmentStatus) => void
  onExport: () => void
  onClear: () => void
}) {
  const [showStatus, setShowStatus] = useState(false)
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
      <span className="text-sm font-semibold text-primary">{count} selected</span>
      <div className="flex-1 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => setShowStatus(v => !v)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-primary/40 transition flex items-center gap-1">
            Change Status <Icon.ChevronRight />
          </button>
          {showStatus && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 min-w-[140px]">
              {(['pending', 'confirmed', 'completed', 'cancelled'] as AppointmentStatus[]).map(s => {
                const cfg = STATUS_CONFIG[s]
                return (
                  <button key={s} onClick={() => { onStatusChange(s); setShowStatus(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 first:rounded-t-xl last:rounded-b-xl">
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} /> {cfg.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-300 transition">
          <Icon.Export /> Export Selected
        </button>
      </div>
      <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 transition px-2">✕ Clear</button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentExtended[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [filter, setFilter]             = useState<FilterStatus>('all')
  const [viewMode, setViewMode]         = useState<ViewMode>('table')
  const [search, setSearch]             = useState('')
  const [selectedAppt, setSelectedAppt] = useState<AppointmentExtended | null>(null)
  const [dateFilter, setDateFilter]     = useState('')
  const [sortKey, setSortKey]           = useState<SortKey>('createdAt')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())

  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setAppointments(snap.docs.map(d => ({ ...(d.data() as Omit<AppointmentExtended, 'id'>), id: d.id })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    let result = appointments.filter(a => {
      if (filter !== 'all' && a.status !== filter) return false
      if (dateFilter && a.preferredDate !== dateFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return a.patientName.toLowerCase().includes(q) || a.patientPhone.includes(q) ||
          (a.patientEmail?.toLowerCase().includes(q) ?? false) || a.reason.toLowerCase().includes(q)
      }
      return true
    })
    result = [...result].sort((a, b) => {
      let va: string, vb: string
      if (sortKey === 'patientName') { va = a.patientName; vb = b.patientName }
      else if (sortKey === 'preferredDate') { va = a.preferredDate; vb = b.preferredDate }
      else if (sortKey === 'status') { va = a.status; vb = b.status }
      else { va = a.createdAt; vb = b.createdAt }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return result
  }, [appointments, filter, dateFilter, search, sortKey, sortDir])

  const todayStr      = getTodayString()
  const todayCount    = appointments.filter(a => a.preferredDate === todayStr && a.status !== 'cancelled').length
  const pendingCount  = appointments.filter(a => a.status === 'pending').length
  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length
  const completedCount = appointments.filter(a => a.status === 'completed').length
  const unpaidCount   = appointments.filter(a => a.paymentStatus === 'unpaid' && a.status !== 'cancelled').length
  const urgentCount   = appointments.filter(a => a.priority === 'urgent' && a.status !== 'cancelled').length

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-primary ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  async function handleStatusChange(id: string, status: AppointmentStatus) {
    try {
      await updateDoc(doc(db, 'appointments', id), { status, updatedAt: serverTimestamp() })
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      toast.success('Status updated')
    } catch { toast.error('Failed to update') }
  }

  async function handleBulkStatusChange(status: AppointmentStatus) {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    try {
      await Promise.all(ids.map(id => updateDoc(doc(db, 'appointments', id), { status, updatedAt: serverTimestamp() })))
      setAppointments(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, status } : a))
      toast.success(`${ids.length} appointments updated to ${status}`)
      setSelectedIds(new Set())
    } catch { toast.error('Bulk update failed') }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(a => a.id)))
  }

  const handleUpdate = useCallback((id: string, data: Partial<AppointmentExtended>) => {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
    if (selectedAppt?.id === id) setSelectedAppt(prev => prev ? { ...prev, ...data } : null)
  }, [selectedAppt])

  const selectedAppts = filtered.filter(a => selectedIds.has(a.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage and track all patient bookings</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            <Icon.Export /> Export
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20">
            + Book Appointment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Today's",   value: todayCount,     color: 'bg-primary/5 text-primary',        border: 'border-primary/20',  action: () => setDateFilter(todayStr) },
          { label: 'Pending',   value: pendingCount,   color: 'bg-amber-50 text-amber-600',        border: 'border-amber-200',   action: () => setFilter('pending')   },
          { label: 'Confirmed', value: confirmedCount,  color: 'bg-blue-50 text-blue-600',          border: 'border-blue-200',    action: () => setFilter('confirmed') },
          { label: 'Completed', value: completedCount,  color: 'bg-emerald-50 text-emerald-600',    border: 'border-emerald-200', action: () => setFilter('completed') },
          { label: 'Unpaid',    value: unpaidCount,    color: 'bg-orange-50 text-orange-600',      border: 'border-orange-200',  action: null },
          { label: 'Urgent',    value: urgentCount,    color: 'bg-red-50 text-red-600',            border: 'border-red-200',     action: null },
        ].map(s => (
          <button key={s.label} onClick={() => s.action?.()}
            className={`rounded-2xl p-4 border text-left transition ${s.color} ${s.border} ${s.action ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium opacity-70 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Icon.Search /></span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email or reason…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        {dateFilter && (
          <button onClick={() => setDateFilter('')} className="text-xs text-gray-500 hover:text-gray-700 px-2">✕ Clear date</button>
        )}
        <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
          {([
            { mode: 'table' as ViewMode, icon: <Icon.Table /> },
            { mode: 'calendar' as ViewMode, icon: <Icon.Calendar /> },
            { mode: 'kanban' as ViewMode, icon: <Icon.Kanban /> },
            { mode: 'timeline' as ViewMode, icon: <Icon.Timeline /> },
          ]).map(({ mode, icon }) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 py-2.5 transition ${viewMode === mode ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title={mode}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_TABS.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${filter === t.value
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
            {t.label}
            <span className="ml-1.5 text-xs opacity-70">
              {t.value === 'all' ? appointments.length : appointments.filter(a => a.status === t.value).length}
            </span>
          </button>
        ))}
        {(filter !== 'all' || dateFilter || search) && (
          <button onClick={() => { setFilter('all'); setDateFilter(''); setSearch('') }}
            className="px-3 py-2 rounded-xl text-xs text-gray-500 border border-dashed border-gray-300 hover:border-gray-400 transition">
            ✕ Clear all filters
          </button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onStatusChange={handleBulkStatusChange}
          onExport={() => exportCSV(selectedAppts, 'selected-appointments')}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-300">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Loading appointments…</span>
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'table' && (
            <>
              {filtered.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-gray-500 font-medium">No appointments found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {search || dateFilter || filter !== 'all' ? 'Try adjusting filters' : 'Book the first appointment'}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 w-10">
                          <button onClick={toggleSelectAll}>
                            <Icon.Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} />
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('patientName')}>
                          Patient <SortIcon k="patientName" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('preferredDate')}>
                          Date & Time <SortIcon k="preferredDate" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => toggleSort('status')}>
                          Status <SortIcon k="status" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(appt => {
                        const cfg = STATUS_CONFIG[appt.status]
                        const isSelected = selectedIds.has(appt.id)
                        return (
                          <tr key={appt.id}
                            className={`hover:bg-blue-50/30 transition cursor-pointer ${appt.priority === 'urgent' ? 'bg-red-50/20' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
                            onClick={() => setSelectedAppt(appt)}>
                            <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(appt.id) }}>
                              <Icon.Checkbox checked={isSelected} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(appt.patientName)}`}>
                                  {getInitials(appt.patientName)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-semibold text-gray-900">{appt.patientName}</p>
                                    {appt.priority === 'urgent' && <span className="text-red-500"><Icon.Urgent /></span>}
                                    {appt.checkedIn && <span className="text-xs text-emerald-600 font-medium">✓</span>}
                                  </div>
                                  <p className="text-xs text-gray-400">{appt.patientPhone}{appt.age ? ` · ${appt.age}y` : ''}{appt.bloodGroup ? ` · ${appt.bloodGroup}` : ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-700 font-medium">{formatDate(appt.preferredDate)}</p>
                              <p className="text-xs text-gray-400">{appt.preferredTime}</p>
                              {appt.rescheduledFrom && <p className="text-xs text-orange-400">Rescheduled</p>}
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                              <p className="text-gray-600 truncate">{appt.reason}</p>
                            </td>
                            <td className="px-4 py-3">
                              {appt.visitType && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full capitalize">
                                  {appt.visitType === 'first' ? '1st' : appt.visitType === 'followup' ? 'F/U' : '🚑'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <div>
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${appt.paymentStatus === 'paid'
                                  ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-50 text-orange-600'}`}>
                                  {appt.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Unpaid'}
                                </span>
                                {appt.appointmentFee && <p className="text-xs text-gray-400 mt-0.5">₹{appt.appointmentFee}</p>}
                              </div>
                            </td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <select value={appt.status}
                                onChange={e => handleStatusChange(appt.id, e.target.value as AppointmentStatus)}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex items-center justify-between">
                    <span>Showing {filtered.length} of {appointments.length} appointments · Click row for details</span>
                    {selectedIds.size > 0 && <span className="text-primary font-semibold">{selectedIds.size} selected</span>}
                  </div>
                </div>
              )}
            </>
          )}
          {viewMode === 'calendar' && <CalendarView appointments={filtered} onSelectAppt={setSelectedAppt} />}
          {viewMode === 'kanban'   && <KanbanView   appointments={filtered} onSelectAppt={setSelectedAppt} />}
          {viewMode === 'timeline' && <TimelineView  appointments={appointments} onSelectAppt={setSelectedAppt} />}
        </>
      )}

      {showModal && (
        <AddAppointmentModal
          onClose={() => setShowModal(false)}
          onAdded={apt => setAppointments(prev => [apt, ...prev])}
          existingAppointments={appointments}
        />
      )}
      {selectedAppt && (
        <AppointmentDrawer
          appointment={selectedAppt}
          allAppointments={appointments}
          onClose={() => setSelectedAppt(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  )
}
