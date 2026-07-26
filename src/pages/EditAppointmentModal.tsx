/**
 * EditAppointmentModal.tsx
 * Full edit modal for an existing appointment.
 * Mirrors AddAppointmentModal fields but pre-fills from the existing record.
 * Does NOT change payment or Razorpay fields.
 */
import { useState, useEffect } from 'react'
import {
  collection, getDocs, query, doc, updateDoc,
  serverTimestamp, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AppointmentStatus } from '@/types'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentForEdit {
  id: string
  patientName: string
  patientPhone: string
  patientEmail: string
  preferredDate: string
  preferredTime: string
  reason: string
  notes?: string
  status: AppointmentStatus
  age?: number
  gender?: string
  bloodGroup?: string
  address?: string
  city?: string
  pincode?: string
  emergencyContact?: string
  knownConditions?: string
  currentMedications?: string
  allergies?: string
  referredBy?: string
  priority?: 'normal' | 'urgent'
  visitType?: 'first' | 'followup' | 'emergency'
  appointmentFee?: number
  doctorId?: string
  doctorName?: string
}

interface DoctorOption { uid: string; name: string; designation?: string }

interface EditAppointmentModalProps {
  appointment: AppointmentForEdit
  existingAppointments: AppointmentForEdit[]
  onClose: () => void
  onUpdated: (id: string, data: Partial<AppointmentForEdit>) => void
}

const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
]

const REASONS = [
  'General Cardiology Consultation', 'Follow-up Visit',
  'ECG / Echocardiogram', 'Chest Pain / Palpitations',
  'Hypertension Management', 'Post-surgery Follow-up',
  'Report Review', 'Second Opinion', 'Other',
]

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// getTodayString removed (unused)

function slotTaken(slots: AppointmentForEdit[], date: string, time: string, excludeId: string) {
  return slots.some(a => a.preferredDate === date && a.preferredTime === time
    && (a.status === 'pending' || a.status === 'confirmed') && a.id !== excludeId)
}

export default function EditAppointmentModal({
  appointment: appt, existingAppointments, onClose, onUpdated,
}: EditAppointmentModalProps) {
  const [doctors, setDoctors]                 = useState<DoctorOption[]>([])
  const [doctorId, setDoctorId]               = useState(appt.doctorId ?? '')
  const [doctorName, setDoctorName]           = useState(appt.doctorName ?? '')
  const [patientName, setPatientName]         = useState(appt.patientName)
  const [patientPhone, setPatientPhone]       = useState(appt.patientPhone)
  const [patientEmail, setPatientEmail]       = useState(appt.patientEmail)
  const [age, setAge]                         = useState(appt.age ? String(appt.age) : '')
  const [gender, setGender]                   = useState<'male'|'female'|'other'|''>(
    (appt.gender as 'male'|'female'|'other') ?? '')
  const [bloodGroup, setBloodGroup]           = useState(appt.bloodGroup ?? '')
  const [date, setDate]                       = useState(appt.preferredDate)
  const [time, setTime]                       = useState(appt.preferredTime)
  const [reason, setReason]                   = useState(REASONS.includes(appt.reason) ? appt.reason : 'Other')
  const [customReason, setCustomReason]       = useState(REASONS.includes(appt.reason) ? '' : appt.reason)
  const [notes, setNotes]                     = useState(appt.notes ?? '')
  const [fee, setFee]                         = useState(appt.appointmentFee ? String(appt.appointmentFee) : '')
  const [priority, setPriority]               = useState<'normal'|'urgent'>(appt.priority ?? 'normal')
  const [visitType, setVisitType]             = useState<'first'|'followup'|'emergency'>(appt.visitType ?? 'first')
  const [address, _setAddress]                 = useState(appt.address ?? '')
  const [city, _setCity]                       = useState(appt.city ?? '')
  const [pincode, _setPincode]                 = useState(appt.pincode ?? '')
  const [emergencyContact, setEmergencyContact] = useState(appt.emergencyContact ?? '')
  const [knownConditions, setKnownConditions] = useState(appt.knownConditions ?? '')
  const [currentMedications, setCurrentMedications] = useState(appt.currentMedications ?? '')
  const [allergies, setAllergies]             = useState(appt.allergies ?? '')
  const [referredBy, setReferredBy]           = useState(appt.referredBy ?? '')
  const [saving, setSaving]                   = useState(false)
  const [slotConflict, setSlotConflict]       = useState(false)

  // Load doctors
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('role', '==', 'doctor')))
      .then(snap => {
        const docs = snap.docs.map(d => ({ uid: d.id, ...(d.data() as Omit<DoctorOption,'uid'>) }))
        docs.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        setDoctors(docs)
      })
      .catch(console.error)
  }, [])

  // Slot conflict check
  useEffect(() => {
    setSlotConflict(date && time ? slotTaken(existingAppointments, date, time, appt.id) : false)
  }, [date, time, existingAppointments, appt.id])

  async function handleSave() {
    if (!patientName.trim() || !patientPhone.trim() || !date || !time || !reason) {
      toast.error('Please fill all required fields'); return
    }
    if (slotConflict) { toast.error('This time slot is already booked'); return }
    setSaving(true)
    try {
      const finalReason = reason === 'Other' ? customReason.trim() || 'Other' : reason
      const firestorePayload: Record<string, unknown> = {
        patientName: patientName.trim(), patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim(), preferredDate: date, preferredTime: time,
        reason: finalReason, notes: notes.trim(),
        priority, visitType,
        doctorId: doctorId || null, doctorName: doctorName || null,
        updatedAt: serverTimestamp(),
      }
      if (age) firestorePayload.age = Number(age)
      if (gender) firestorePayload.gender = gender
      if (bloodGroup) firestorePayload.bloodGroup = bloodGroup
      if (fee) firestorePayload.appointmentFee = Number(fee)
      if (address.trim()) firestorePayload.address = address.trim()
      if (city.trim()) firestorePayload.city = city.trim()
      if (pincode.trim()) firestorePayload.pincode = pincode.trim()
      if (emergencyContact.trim()) firestorePayload.emergencyContact = emergencyContact.trim()
      if (knownConditions.trim()) firestorePayload.knownConditions = knownConditions.trim()
      if (currentMedications.trim()) firestorePayload.currentMedications = currentMedications.trim()
      if (allergies.trim()) firestorePayload.allergies = allergies.trim()
      if (referredBy.trim()) firestorePayload.referredBy = referredBy.trim()

      await updateDoc(doc(db, 'appointments', appt.id), firestorePayload)
      onUpdated(appt.id, {
        ...firestorePayload,
        age: age ? Number(age) : undefined,
        appointmentFee: fee ? Number(fee) : undefined,
      } as Partial<AppointmentForEdit>)
      toast.success('Appointment updated')
      onClose()
    } catch (err) {
      console.error(err); toast.error('Failed to save changes')
    } finally { setSaving(false) }
  }

  const CloseIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
    </svg>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-w-[95vw] max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Edit Appointment</h2>
            <p className="text-xs text-gray-400 mt-0.5">Ref: #{appt.id.slice(0,8).toUpperCase()}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition">
            <CloseIcon />
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

          {/* Assign Doctor */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assign Doctor</label>
            <select value={doctorId} onChange={e => {
              const sel = doctors.find(d => d.uid === e.target.value)
              setDoctorId(e.target.value); setDoctorName(sel?.name ?? '')
            }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">— Unassigned —</option>
              {doctors.map(d => (
                <option key={d.uid} value={d.uid}>{d.name}{d.designation ? ` · ${d.designation}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Patient Details */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Patient Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone *</label>
                <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Patient Name *</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                <input value={patientEmail} onChange={e => setPatientEmail(e.target.value)} type="email"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Age (years)</label>
                <input value={age} onChange={e => setAge(e.target.value)} type="number" min={1} max={120}
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

          {/* Medical Profile */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Medical Profile</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Emergency Contact</label>
                <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                  placeholder="e.g. Ravi Kumar — 9876543210"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Known Conditions</label>
                <input value={knownConditions} onChange={e => setKnownConditions(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Medications</label>
                  <input value={currentMedications} onChange={e => setCurrentMedications(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Allergies</label>
                  <input value={allergies} onChange={e => setAllergies(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Referred By</label>
                <input value={referredBy} onChange={e => setReferredBy(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Time Slot *</label>
                <select value={time} onChange={e => setTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select time</option>
                  {TIME_SLOTS.map(t => {
                    const booked = slotTaken(existingAppointments, date, t, appt.id)
                    return <option key={t} value={t} disabled={booked}>{booked ? `${t} — Booked` : t}</option>
                  })}
                </select>
                {slotConflict && <p className="text-xs text-red-500 mt-1">⚠ Slot already booked</p>}
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
              <input value={customReason} onChange={e => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mt-2" />
            )}
          </div>

          {/* Fee & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fee (₹)</label>
              <input value={fee} onChange={e => setFee(e.target.value)} type="number" min={0}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Admin Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6 border-t border-gray-50 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
