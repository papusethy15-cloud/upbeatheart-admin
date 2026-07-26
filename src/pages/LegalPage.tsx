/**
 * UpBeat Heart — Admin Dashboard
 * LegalPage.tsx — FAQ, Privacy Policy & Terms of Service
 *
 * Three tabs, each saved as a structured document in Firestore:
 *   legal/faq           → { items: [{q, a, category}] }
 *   legal/privacy       → { sections: [{heading, body}], updatedAt }
 *   legal/terms         → { sections: [{heading, body}], updatedAt }
 *
 * FAQ tab: add/edit/delete/reorder Q&A cards grouped by category.
 * Privacy & Terms tabs: rich section editor (heading + multi-paragraph body).
 * All saves go to Firestore under collection "legal".
 * Website reads the same docs and renders them client-side.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import toast from 'react-hot-toast'
import {
  HelpCircle, Shield, FileText, Plus, Trash2, GripVertical,
  ChevronDown, ChevronUp, Save, RefreshCw, Eye, EyeOff,
  AlertCircle, CheckCircle2, Loader2, Pencil, X, Tag,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

interface LegalSection {
  id: string
  heading: string
  body: string   // plain text with \n\n for paragraph breaks
}

interface FaqDoc  { items: FaqItem[];    updatedAt?: string }
interface LegalDoc { sections: LegalSection[]; updatedAt?: string; effectiveDate?: string }

type TabId = 'faq' | 'privacy' | 'terms'

// ─── FAQ Categories ───────────────────────────────────────────────────────────

const FAQ_CATEGORIES = [
  'General',
  'Appointments',
  'Donations & Payments',
  'Patient Assistance Campaigns',
  'NGO Partnerships',
  'Doctor App',
  'Data & Privacy',
  'Technical',
]

// ─── Default content ──────────────────────────────────────────────────────────

const DEFAULT_FAQ: FaqItem[] = [
  {
    id: 'f1', order: 1, category: 'General',
    question: 'What is UpBeat Heart?',
    answer: 'UpBeat Heart is a cardiac-care NGO platform that connects heart patients with verified doctors, NGO partners, and donors. We facilitate online appointment booking, fundraising campaigns for patients in need, and medical assistance programmes.',
  },
  {
    id: 'f2', order: 2, category: 'General',
    question: 'Is UpBeat Heart a registered NGO?',
    answer: 'Yes. UpBeat Heart operates under a registered charitable trust. Our registration details are available on request and are on file with the relevant government authorities.',
  },
  {
    id: 'f3', order: 3, category: 'Appointments',
    question: 'How do I book a cardiology appointment?',
    answer: 'Visit the Appointments section on our website, fill in your name, contact details, preferred date and time slot, and reason for visit. Our admin team will confirm the appointment within 24 hours via phone or email.',
  },
  {
    id: 'f4', order: 4, category: 'Appointments',
    question: 'Can I reschedule or cancel my appointment?',
    answer: 'Yes. Contact us via phone or email at least 24 hours before your scheduled time and we will reschedule or cancel at no charge. Same-day cancellations may attract a nominal fee depending on the doctor\'s policy.',
  },
  {
    id: 'f5', order: 5, category: 'Appointments',
    question: 'What should I bring to my appointment?',
    answer: 'Please carry any previous medical reports, prescriptions, ECG / Echo recordings, and a valid photo ID. Arriving 10 minutes early allows us to complete check-in formalities.',
  },
  {
    id: 'f6', order: 6, category: 'Donations & Payments',
    question: 'How can I donate to a patient campaign?',
    answer: 'Each Patient Assistance Campaign page has a "Donate" button. We accept online payments via Razorpay (credit/debit cards, UPI, net banking, wallets). You will receive an email confirmation and a receipt immediately after a successful payment.',
  },
  {
    id: 'f7', order: 7, category: 'Donations & Payments',
    question: 'Is my donation tax-exempt?',
    answer: 'Donations made to UpBeat Heart may be eligible for tax exemption under Section 80G of the Income Tax Act (India). Please contact us for a certificate. Tax benefits are subject to prevailing government regulations.',
  },
  {
    id: 'f8', order: 8, category: 'Donations & Payments',
    question: 'Which payment methods are accepted?',
    answer: 'We accept all major credit and debit cards, UPI (GPay, PhonePe, Paytm, BHIM), net banking, and popular digital wallets via our Razorpay payment gateway. Cash and cheque donations can be arranged offline — please contact us.',
  },
  {
    id: 'f9', order: 9, category: 'Donations & Payments',
    question: 'What happens if a payment fails?',
    answer: 'If your payment fails or is declined, your money will not be deducted. In rare cases of bank holds, the amount is typically reversed within 5–7 business days. Write to us with your transaction reference and we will assist immediately.',
  },
  {
    id: 'f10', order: 10, category: 'Patient Assistance Campaigns',
    question: 'How are Patient Assistance Campaigns verified?',
    answer: 'Every campaign submitted on UpBeat Heart goes through a multi-step review: (1) admin review of documents, (2) hospital verification of the diagnosis and treatment cost, and (3) doctor verification on our platform. Only campaigns that clear all three stages are published.',
  },
  {
    id: 'f11', order: 11, category: 'Patient Assistance Campaigns',
    question: 'How are the raised funds disbursed to patients?',
    answer: 'Funds are transferred directly to the hospital or verified treatment centre in tranches aligned with the treatment plan — not to the patient personally. This ensures funds are used solely for medical purposes.',
  },
  {
    id: 'f12', order: 12, category: 'Patient Assistance Campaigns',
    question: 'Can I start a campaign for someone I know?',
    answer: 'Yes. If you know a heart patient in financial need, contact us with their medical documents, hospital details, and cost estimate. Our team will guide you through the verification and campaign setup process.',
  },
  {
    id: 'f13', order: 13, category: 'NGO Partnerships',
    question: 'How can my NGO partner with UpBeat Heart?',
    answer: 'Submit a partnership request through our website\'s NGO Registration form. Provide your NGO\'s registration number, contact person, areas of focus, and supporting documents. Our team reviews all applications within 7 working days.',
  },
  {
    id: 'f14', order: 14, category: 'NGO Partnerships',
    question: 'What benefits do NGO partners receive?',
    answer: 'Approved NGO partners are listed on our platform, can co-sponsor Patient Assistance Campaigns, receive referrals from our doctor network, and are invited to participate in health camps and community events.',
  },
  {
    id: 'f15', order: 15, category: 'Doctor App',
    question: 'How do doctors use the UpBeat Heart Doctor App?',
    answer: 'Verified doctors on our platform receive a dedicated login for the UpBeat Heart Doctor App. They can view and manage their appointments, review and approve patient campaigns, publish medical articles, and get push notifications for new bookings.',
  },
  {
    id: 'f16', order: 16, category: 'Data & Privacy',
    question: 'Is my personal data safe with UpBeat Heart?',
    answer: 'Yes. We take data security seriously. All personal and medical data is encrypted in transit (TLS 1.3) and at rest. We do not sell or share your data with third parties except as necessary to provide our services (e.g., the assigned doctor, payment gateway). See our Privacy Policy for full details.',
  },
  {
    id: 'f17', order: 17, category: 'Data & Privacy',
    question: 'Can I request deletion of my data?',
    answer: 'You may request deletion of your personal data by emailing us. We will action the request within 30 days, subject to legal obligations to retain certain records (e.g., financial transactions).',
  },
]

const DEFAULT_PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'p1', heading: '1. Introduction',
    body: `UpBeat Heart ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and disclose information about you when you use our website, mobile applications, and services ("Platform").\n\nBy using our Platform, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of our Platform.`,
  },
  {
    id: 'p2', heading: '2. Information We Collect',
    body: `We collect the following categories of information:\n\n**Personal Identification Information:** Name, email address, phone number, date of birth, gender, and address — provided when you book an appointment, register a campaign, or make a donation.\n\n**Medical Information:** Health history, diagnosis, treatment details, medical reports, and doctor notes — collected only when you submit or are the subject of a Patient Assistance Campaign, or when booking a cardiology appointment.\n\n**Payment Information:** We do not store card details. Payments are processed by Razorpay, a PCI-DSS compliant payment gateway. We receive only a transaction reference and status.\n\n**Usage Data:** IP address, browser type, device identifiers, pages visited, and time spent — collected automatically via analytics tools to improve the Platform.\n\n**Communications:** Messages, feedback, and support queries you send us.`,
  },
  {
    id: 'p3', heading: '3. How We Use Your Information',
    body: `We use your information to:\n\n• Book and manage cardiology appointments and notify the assigned doctor.\n• Process donations and issue receipts.\n• Review, verify, and publish Patient Assistance Campaigns.\n• Communicate with you about your appointments, donations, or campaign status.\n• Send push notifications to doctors via Firebase Cloud Messaging.\n• Comply with legal obligations including financial record-keeping.\n• Improve the Platform through analytics.\n\nWe do not use your information for automated decision-making or profiling that produces legal or similarly significant effects.`,
  },
  {
    id: 'p4', heading: '4. Payments & Razorpay',
    body: `Donations and appointment fees on UpBeat Heart are processed through Razorpay, a third-party payment gateway compliant with PCI-DSS standards.\n\nWhen you make a payment:\n• Your card, UPI, or bank details are entered directly on Razorpay's secure servers and are never transmitted to or stored on UpBeat Heart's systems.\n• We receive only the payment status, Razorpay order ID, and payment ID.\n• Razorpay's own Privacy Policy governs their handling of your financial data.\n\nFor refunds or payment disputes, please contact us with your Razorpay payment reference. Refunds are processed within 5–7 business days to the original payment method.`,
  },
  {
    id: 'p5', heading: '5. How We Share Your Information',
    body: `We do not sell your personal data. We may share it only in the following circumstances:\n\n**Assigned Doctors:** Appointment details (name, phone, medical history) are shared with the doctor assigned to your appointment.\n\n**NGO Partners:** When your campaign is co-sponsored by an NGO, relevant campaign information is shared with the partner organisation.\n\n**Payment Gateway:** Razorpay receives transaction data necessary to process payments.\n\n**Legal Requirements:** We may disclose your information to comply with a court order, legal process, or government request, or to protect the rights and safety of UpBeat Heart and its users.\n\n**Service Providers:** We use Firebase (Google) for database and authentication, Cloudinary for media storage, and third-party analytics. These providers are contractually bound to protect your data.`,
  },
  {
    id: 'p6', heading: '6. Data Retention',
    body: `We retain your personal data for as long as necessary to fulfil the purposes described in this policy, or as required by law.\n\n• Appointment records: retained for 7 years for medical and legal compliance.\n• Donation and financial records: retained for 7 years per Indian accounting law.\n• Campaign data: retained for 5 years after campaign closure.\n• Account data: deleted within 30 days of a verified deletion request, except where retention is legally required.`,
  },
  {
    id: 'p7', heading: '7. Cookies & Analytics',
    body: `Our website uses cookies and similar technologies to enhance user experience and collect analytics data.\n\n• **Essential cookies** enable core functionality such as session management.\n• **Analytics cookies** (Google Analytics 4) help us understand how users interact with the Platform. Data is anonymised and aggregated.\n\nYou may disable cookies via your browser settings. Disabling essential cookies may affect Platform functionality.`,
  },
  {
    id: 'p8', heading: '8. Security',
    body: `We implement industry-standard technical and organisational measures to protect your data, including:\n\n• TLS 1.3 encryption for all data in transit.\n• Firebase Security Rules restricting database access to authorised users.\n• Role-based access control — only admins and the assigned doctor can view patient appointment details.\n• Regular security reviews of our platform and third-party integrations.\n\nNo method of transmission over the internet is 100% secure. In the event of a data breach affecting your rights, we will notify you within 72 hours as required by applicable law.`,
  },
  {
    id: 'p9', heading: '9. Children\'s Privacy',
    body: `Our Platform is not directed at children under 13. We do not knowingly collect personal data from children. If a parent or guardian believes their child has provided us personal data, please contact us and we will delete it promptly.\n\nFor Patient Assistance Campaigns involving minors, parental or guardian consent is mandatory and documented before the campaign is published.`,
  },
  {
    id: 'p10', heading: '10. Your Rights',
    body: `You have the following rights regarding your personal data:\n\n• **Access:** Request a copy of the personal data we hold about you.\n• **Correction:** Request correction of inaccurate or incomplete data.\n• **Deletion:** Request deletion of your data (subject to legal retention obligations).\n• **Objection:** Object to processing of your data for marketing purposes.\n• **Portability:** Request your data in a machine-readable format.\n\nTo exercise any of these rights, contact us at the email below. We will respond within 30 days.`,
  },
  {
    id: 'p11', heading: '11. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we do, we will revise the "Effective Date" at the top of this page and, where appropriate, notify you by email or prominent notice on the Platform.\n\nWe encourage you to review this policy periodically.`,
  },
  {
    id: 'p12', heading: '12. Contact Us',
    body: `If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us:\n\nUpBeat Heart\nEmail: privacy@upbeatheart.com\nPhone: [Your Phone Number]\nAddress: [Your Address]\n\nFor payment-related queries, please also include your Razorpay Order ID or Payment ID.`,
  },
]

const DEFAULT_TERMS_SECTIONS: LegalSection[] = [
  {
    id: 't1', heading: '1. Acceptance of Terms',
    body: `By accessing or using the UpBeat Heart Platform ("Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Platform.\n\nThese Terms apply to all visitors, users, patients, donors, NGOs, and doctors who access or use our services. "We", "us", or "UpBeat Heart" refers to the organisation operating this Platform.`,
  },
  {
    id: 't2', heading: '2. Description of Services',
    body: `UpBeat Heart provides the following services through its Platform:\n\n**Cardiology Appointment Booking:** Patients may book appointments with verified cardiologists. Bookings are subject to availability and confirmation by our team.\n\n**Patient Assistance Campaigns:** Verified fundraising campaigns for heart patients in financial need. Donations are collected online via Razorpay.\n\n**NGO Partner Network:** Registration and collaboration with NGOs focused on cardiac care and patient assistance.\n\n**Medical Content:** Educational articles and disease information authored and reviewed by verified doctors.\n\n**Donation Processing:** Secure online donation collection for active patient campaigns.\n\nWe reserve the right to modify, suspend, or discontinue any part of the Platform at any time.`,
  },
  {
    id: 't3', heading: '3. User Responsibilities',
    body: `By using the Platform, you agree to:\n\n• Provide accurate, current, and complete information when booking appointments, submitting campaigns, or making donations.\n• Not impersonate any person or entity or misrepresent your affiliation.\n• Not use the Platform for any unlawful purpose or in violation of any applicable law.\n• Not upload false medical documents or fabricate patient information for campaigns.\n• Not attempt to interfere with or disrupt the Platform's infrastructure.\n\nViolation of these responsibilities may result in immediate termination of access and, where applicable, legal action.`,
  },
  {
    id: 't4', heading: '4. Appointments',
    body: `**Booking:** Appointments are requests, not guarantees. Confirmation is subject to doctor availability and is communicated within 24 hours.\n\n**Cancellations:** Please cancel at least 24 hours in advance. Late cancellations or no-shows may attract a cancellation fee at the doctor's discretion.\n\n**Medical Advice:** Content on our Platform is informational only. It does not constitute medical advice and does not replace a consultation with a qualified medical professional. Always consult your doctor for diagnosis and treatment decisions.\n\n**Emergency Services:** Our Platform does not provide emergency medical services. In a medical emergency, call emergency services (112 in India) immediately.`,
  },
  {
    id: 't5', heading: '5. Donations & Payments',
    body: `**Payment Gateway:** All online payments are processed by Razorpay. By making a payment, you also agree to Razorpay's Terms of Service and Privacy Policy.\n\n**Accepted Methods:** Credit/debit cards, UPI, net banking, and digital wallets are accepted through Razorpay. Offline donations (cash, cheque, bank transfer) may be arranged by contacting us.\n\n**Refunds:** Donations are generally non-refundable once a campaign has commenced disbursement. If a campaign is cancelled before disbursement, we will process a full refund within 7–10 business days. For appointment fee refunds, contact us within 48 hours of the appointment.\n\n**Fund Utilisation:** 100% of funds raised for a specific campaign are used for that patient's verified medical treatment. Administrative costs are funded separately by our organisation.\n\n**Tax Receipts:** Section 80G receipts (where applicable) are issued on request. Donors are responsible for verifying eligibility with their tax adviser.`,
  },
  {
    id: 't6', heading: '6. Patient Assistance Campaigns',
    body: `**Submission:** Campaign submissions must include valid hospital documents, medical reports, and the patient's or guardian's written consent.\n\n**Verification:** All campaigns undergo admin review, hospital verification, and doctor approval before publication. We reserve the right to reject any campaign that does not meet our standards.\n\n**Accuracy:** Campaign creators are responsible for the accuracy of the information submitted. Providing false information is grounds for immediate removal of the campaign, reversal of donations, and potential legal action.\n\n**Updates:** Campaign administrators are required to provide regular treatment updates. Campaigns without updates for 60 days may be paused or closed.\n\n**Closure:** Upon treatment completion or campaign closure, remaining funds (if any) are handled per the terms agreed upon during campaign approval.`,
  },
  {
    id: 't7', heading: '7. NGO Partnership Terms',
    body: `**Eligibility:** NGOs applying for partnership must be registered under applicable Indian law (Societies Registration Act, Companies Act Section 8, or equivalent) and focused on healthcare or patient welfare.\n\n**Obligations:** Partner NGOs agree to provide accurate information, maintain their registration status, and notify UpBeat Heart of any material changes.\n\n**Co-sponsorship:** NGOs co-sponsoring campaigns must ensure funds contributed are used solely for the stated purpose.\n\n**Termination:** UpBeat Heart reserves the right to terminate a partnership agreement with 30 days' notice for any breach of these terms or for reputational reasons.`,
  },
  {
    id: 't8', heading: '8. Intellectual Property',
    body: `All content on the Platform — including text, graphics, logos, icons, medical articles, and code — is the property of UpBeat Heart or its content partners and is protected by applicable intellectual property laws.\n\nYou may not reproduce, distribute, modify, or create derivative works from any Platform content without our express written consent.\n\nUser-submitted content (campaign stories, patient photos with consent, reviews) remains the property of the submitter, but you grant UpBeat Heart a non-exclusive, royalty-free licence to display and promote it on the Platform and related marketing materials.`,
  },
  {
    id: 't9', heading: '9. Disclaimers & Limitation of Liability',
    body: `**Medical Disclaimer:** UpBeat Heart is not a medical provider. Information on the Platform is educational and does not substitute professional medical advice, diagnosis, or treatment.\n\n**Platform Availability:** We do not guarantee uninterrupted or error-free operation of the Platform. Scheduled and emergency maintenance may cause temporary unavailability.\n\n**Third-Party Links:** We are not responsible for the content, privacy practices, or services of linked third-party websites or services (including Razorpay).\n\n**Limitation of Liability:** To the maximum extent permitted by law, UpBeat Heart shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the Platform, including loss of data or financial loss beyond the amount directly paid through our Platform for the relevant transaction.`,
  },
  {
    id: 't10', heading: '10. Governing Law & Dispute Resolution',
    body: `These Terms are governed by and construed in accordance with the laws of India. Any disputes arising from or relating to these Terms or your use of the Platform shall be subject to the exclusive jurisdiction of the courts of [Your City], India.\n\nWe encourage resolution of disputes through good-faith negotiation. If an issue cannot be resolved informally, it may be referred to arbitration under the Arbitration and Conciliation Act, 1996, with a single arbitrator appointed by mutual consent.`,
  },
  {
    id: 't11', heading: '11. Changes to Terms',
    body: `We reserve the right to update these Terms at any time. We will notify you of significant changes by updating the "Effective Date" and, where appropriate, by email notification.\n\nContinued use of the Platform after changes are posted constitutes acceptance of the revised Terms.`,
  },
  {
    id: 't12', heading: '12. Contact',
    body: `For questions about these Terms of Service, please contact:\n\nUpBeat Heart\nEmail: legal@upbeatheart.com\nPhone: [Your Phone Number]\nAddress: [Your Address]`,
  },
]

// ─── Utility ──────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 10) }

function formatUpdated(ts: string | undefined) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Tab header ───────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'faq',     label: 'FAQ',            icon: HelpCircle, color: 'text-blue-600'   },
  { id: 'privacy', label: 'Privacy Policy', icon: Shield,     color: 'text-violet-600' },
  { id: 'terms',   label: 'Terms of Service', icon: FileText, color: 'text-emerald-600' },
]

// ─── Section Editor (Privacy & Terms) ────────────────────────────────────────

function SectionEditor({
  sections, setSections,
}: {
  sections: LegalSection[]
  setSections: (s: LegalSection[]) => void
}) {
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [draftHead, setDraftHead]   = useState('')
  const [draftBody, setDraftBody]   = useState('')
  const [preview, setPreview]       = useState<string | null>(null)

  function startEdit(s: LegalSection) {
    setEditingId(s.id); setDraftHead(s.heading); setDraftBody(s.body)
    setPreview(null)
  }

  function cancelEdit() { setEditingId(null); setDraftHead(''); setDraftBody('') }

  function saveEdit() {
    if (!draftHead.trim()) { toast.error('Heading is required'); return }
    setSections(sections.map(s => s.id === editingId
      ? { ...s, heading: draftHead.trim(), body: draftBody.trim() } : s))
    cancelEdit()
  }

  function addSection() {
    const id = genId()
    const newSec: LegalSection = { id, heading: 'New Section', body: '' }
    setSections([...sections, newSec])
    startEdit(newSec)
  }

  function removeSection(id: string) {
    if (!confirm('Delete this section?')) return
    setSections(sections.filter(s => s.id !== id))
    if (editingId === id) cancelEdit()
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const arr = [...sections]
    ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
    setSections(arr)
  }

  function moveDown(idx: number) {
    if (idx === sections.length - 1) return
    const arr = [...sections]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    setSections(arr)
  }

  // Render body: **bold** → <strong>, \n\n → paragraph, \n → <br>
  function renderBody(text: string) {
    return text.split('\n\n').map((para, i) => {
      const html = para
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>')
      return <p key={i} className="text-sm text-gray-700 leading-relaxed mb-3 last:mb-0" dangerouslySetInnerHTML={{ __html: html }} />
    })
  }

  return (
    <div className="space-y-3">
      {sections.map((s, idx) => (
        <div key={s.id} className={clsx('border rounded-2xl overflow-hidden transition-shadow',
          editingId === s.id ? 'border-primary/40 shadow-md' : 'border-gray-100 hover:shadow-sm bg-white')}>
          {/* Section header row */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
            <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{s.heading || 'Untitled'}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => moveUp(idx)} disabled={idx === 0}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition text-gray-500">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => moveDown(idx)} disabled={idx === sections.length - 1}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition text-gray-500">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setPreview(preview === s.id ? null : s.id)}
                className="p-1.5 rounded-lg hover:bg-blue-50 transition text-blue-500" title="Preview">
                {preview === s.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => editingId === s.id ? cancelEdit() : startEdit(s)}
                className="p-1.5 rounded-lg hover:bg-primary/10 transition text-primary" title="Edit">
                {editingId === s.id ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => removeSection(s.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 transition text-red-400" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview === s.id && editingId !== s.id && (
            <div className="px-5 py-4 border-t border-gray-100 bg-white">
              <h3 className="font-bold text-gray-900 text-base mb-2">{s.heading}</h3>
              {renderBody(s.body)}
            </div>
          )}

          {/* Edit form */}
          {editingId === s.id && (
            <div className="px-4 py-4 border-t border-primary/20 bg-white space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Section Heading</label>
                <input value={draftHead} onChange={e => setDraftHead(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="e.g. 3. How We Use Your Information" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Body <span className="text-gray-400 font-normal normal-case">· Use **text** for bold · Blank line = new paragraph · \\n = line break</span>
                </label>
                <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)}
                  rows={10} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y font-mono"
                  placeholder="Enter section content here..." />
              </div>
              <div className="flex gap-2">
                <button onClick={cancelEdit}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button onClick={saveEdit}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Save Section
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button onClick={addSection}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add Section
      </button>
    </div>
  )
}

// ─── FAQ Tab ──────────────────────────────────────────────────────────────────

function FaqTab({ items, setItems }: { items: FaqItem[]; setItems: (f: FaqItem[]) => void }) {
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [draftQ, setDraftQ]           = useState('')
  const [draftA, setDraftA]           = useState('')
  const [draftCat, setDraftCat]       = useState(FAQ_CATEGORIES[0])
  const [filterCat, setFilterCat]     = useState<string>('All')
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const categories = ['All', ...FAQ_CATEGORIES]
  const filtered = filterCat === 'All' ? items : items.filter(i => i.category === filterCat)

  function startEdit(item: FaqItem) {
    setEditingId(item.id); setDraftQ(item.question); setDraftA(item.answer); setDraftCat(item.category)
  }

  function startAdd() {
    const id = genId()
    const newItem: FaqItem = { id, category: FAQ_CATEGORIES[0], question: '', answer: '', order: items.length + 1 }
    setItems([...items, newItem])
    setEditingId(id); setDraftQ(''); setDraftA(''); setDraftCat(FAQ_CATEGORIES[0])
  }

  function cancelEdit() {
    // Remove if it was a newly added empty item
    const item = items.find(i => i.id === editingId)
    if (item && !item.question) setItems(items.filter(i => i.id !== editingId))
    setEditingId(null); setDraftQ(''); setDraftA('')
  }

  function saveEdit() {
    if (!draftQ.trim()) { toast.error('Question is required'); return }
    if (!draftA.trim()) { toast.error('Answer is required'); return }
    setItems(items.map(i => i.id === editingId
      ? { ...i, question: draftQ.trim(), answer: draftA.trim(), category: draftCat } : i))
    setEditingId(null)
  }

  function removeItem(id: string) {
    if (!confirm('Delete this FAQ item?')) return
    setItems(items.filter(i => i.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function moveUp(idx: number) {
    const arr = [...filtered]
    if (idx === 0) return
    const aIdx = items.indexOf(arr[idx]); const bIdx = items.indexOf(arr[idx - 1])
    const full = [...items];[full[aIdx], full[bIdx]] = [full[bIdx], full[aIdx]]
    setItems(full)
  }

  function moveDown(idx: number) {
    const arr = [...filtered]
    if (idx === arr.length - 1) return
    const aIdx = items.indexOf(arr[idx]); const bIdx = items.indexOf(arr[idx + 1])
    const full = [...items];[full[aIdx], full[bIdx]] = [full[bIdx], full[aIdx]]
    setItems(full)
  }

  // Group by category for display
  const grouped = filtered.reduce<Record<string, FaqItem[]>>((acc, item) => {
    ;(acc[item.category] = acc[item.category] || []).push(item)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold border transition',
              filterCat === c ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40')}>
            {c} {c === 'All' ? `(${items.length})` : `(${items.filter(i => i.category === c).length})`}
          </button>
        ))}
      </div>

      {/* FAQ items grouped */}
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-2 py-1">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wide">{cat}</span>
            <span className="text-xs text-gray-400">({catItems.length})</span>
          </div>

          {catItems.map((item, idx) => (
            <div key={item.id} className={clsx('border rounded-2xl overflow-hidden transition',
              editingId === item.id ? 'border-primary/40 shadow-md' : 'border-gray-100 bg-white hover:shadow-sm')}>
              {/* Q row */}
              <div className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                onClick={() => editingId !== item.id && setExpandedId(expandedId === item.id ? null : item.id)}>
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">Q</span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{item.question || <em className="text-gray-400">New question…</em>}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={e => { e.stopPropagation(); moveUp(idx) }} disabled={idx === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); moveDown(idx) }} disabled={idx === catItems.length - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-400"><ChevronDown className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); editingId === item.id ? cancelEdit() : startEdit(item) }}
                    className="p-1 rounded hover:bg-primary/10 text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); removeItem(item.id) }}
                    className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Expanded answer (read view) */}
              {expandedId === item.id && editingId !== item.id && (
                <div className="px-4 pb-4 border-t border-gray-50">
                  <div className="flex items-start gap-3 pt-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">A</span>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                  </div>
                </div>
              )}

              {/* Edit form */}
              {editingId === item.id && (
                <div className="px-4 py-4 border-t border-primary/20 bg-white space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                    <select value={draftCat} onChange={e => setDraftCat(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                      {FAQ_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Question *</label>
                    <input value={draftQ} onChange={e => setDraftQ(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="e.g. How do I book an appointment?" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Answer *</label>
                    <textarea value={draftA} onChange={e => setDraftA(e.target.value)}
                      rows={5} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                      placeholder="Write the answer here..." />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={cancelEdit}
                      className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                    <button onClick={saveEdit}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No FAQ items yet in this category.</p>
        </div>
      )}

      <button onClick={startAdd}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-500 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add FAQ Item
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LegalPage() {
  const [activeTab, setActiveTab]       = useState<TabId>('faq')
  const [faqItems, setFaqItems]         = useState<FaqItem[]>([])
  const [privacySections, setPrivacy]   = useState<LegalSection[]>([])
  const [termsSections, setTerms]       = useState<LegalSection[]>([])
  const [faqUpdated, setFaqUpdated]     = useState<string>()
  const [privacyUpdated, setPrivacyUpdated] = useState<string>()
  const [termsUpdated, setTermsUpdated] = useState<string>()
  const [privacyDate, setPrivacyDate]   = useState('')
  const [termsDate, setTermsDate]       = useState('')
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  // ── Load from Firestore ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [faqSnap, privSnap, termsSnap] = await Promise.all([
        getDoc(doc(db, 'legal', 'faq')),
        getDoc(doc(db, 'legal', 'privacy')),
        getDoc(doc(db, 'legal', 'terms')),
      ])

      if (faqSnap.exists()) {
        const d = faqSnap.data() as FaqDoc
        setFaqItems(d.items ?? DEFAULT_FAQ)
        setFaqUpdated(d.updatedAt)
      } else {
        setFaqItems(DEFAULT_FAQ)
      }

      if (privSnap.exists()) {
        const d = privSnap.data() as LegalDoc
        setPrivacy(d.sections ?? DEFAULT_PRIVACY_SECTIONS)
        setPrivacyUpdated(d.updatedAt)
        setPrivacyDate(d.effectiveDate ?? '')
      } else {
        setPrivacy(DEFAULT_PRIVACY_SECTIONS)
      }

      if (termsSnap.exists()) {
        const d = termsSnap.data() as LegalDoc
        setTerms(d.sections ?? DEFAULT_TERMS_SECTIONS)
        setTermsUpdated(d.updatedAt)
        setTermsDate(d.effectiveDate ?? '')
      } else {
        setTerms(DEFAULT_TERMS_SECTIONS)
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load legal content')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Save ─────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    try {
      if (activeTab === 'faq') {
        await setDoc(doc(db, 'legal', 'faq'), {
          items: faqItems.map((item, idx) => ({ ...item, order: idx + 1 })),
          updatedAt: now,
          _serverTs: serverTimestamp(),
        })
        setFaqUpdated(now)
        toast.success('FAQ saved successfully')
      } else if (activeTab === 'privacy') {
        await setDoc(doc(db, 'legal', 'privacy'), {
          sections: privacySections,
          effectiveDate: privacyDate,
          updatedAt: now,
          _serverTs: serverTimestamp(),
        })
        setPrivacyUpdated(now)
        toast.success('Privacy Policy saved successfully')
      } else {
        await setDoc(doc(db, 'legal', 'terms'), {
          sections: termsSections,
          effectiveDate: termsDate,
          updatedAt: now,
          _serverTs: serverTimestamp(),
        })
        setTermsUpdated(now)
        toast.success('Terms of Service saved successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to save — check console')
    } finally { setSaving(false) }
  }

  async function loadDefaults() {
    if (!confirm('Reset to default content? All current edits will be lost.')) return
    if (activeTab === 'faq')     setFaqItems(DEFAULT_FAQ)
    if (activeTab === 'privacy') setPrivacy(DEFAULT_PRIVACY_SECTIONS)
    if (activeTab === 'terms')   setTerms(DEFAULT_TERMS_SECTIONS)
    toast.success('Default content loaded — click Save to persist')
  }

  const updatedAt = activeTab === 'faq' ? faqUpdated : activeTab === 'privacy' ? privacyUpdated : termsUpdated

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Legal & FAQ</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage FAQ, Privacy Policy, and Terms of Service. Content is read live from the database by the website.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadDefaults}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition">
            <RefreshCw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 shadow-md shadow-primary/20">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
        <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-0.5">
          <p className="font-semibold">How it works</p>
          <p>Edit content here and click <strong>Save Changes</strong>. Your website reads directly from Firestore collection <code className="bg-blue-100 px-1 rounded">legal</code> — documents <code className="bg-blue-100 px-1 rounded">faq</code>, <code className="bg-blue-100 px-1 rounded">privacy</code>, <code className="bg-blue-100 px-1 rounded">terms</code>. Changes go live immediately after saving.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 gap-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap',
                activeTab === tab.id
                  ? `border-primary text-primary`
                  : 'border-transparent text-gray-500 hover:text-gray-700')}>
              <Icon className={clsx('w-4 h-4', activeTab === tab.id ? 'text-primary' : 'text-gray-400')} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Last saved */}
      {updatedAt && (
        <p className="text-xs text-gray-400 -mt-2 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Last saved: {formatUpdated(updatedAt)}
        </p>
      )}

      {/* Tab content */}
      <div>
        {/* ── FAQ ── */}
        {activeTab === 'faq' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">{faqItems.length} FAQ items</p>
                <p className="text-xs text-gray-400 mt-0.5">Click a question to expand. Click the pencil icon to edit.</p>
              </div>
            </div>
            <FaqTab items={faqItems} setItems={setFaqItems} />
          </div>
        )}

        {/* ── Privacy Policy ── */}
        {activeTab === 'privacy' && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
              <Shield className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-800">Privacy Policy</p>
                <p className="text-xs text-violet-600 mt-0.5">{privacySections.length} sections · Saved to <code>legal/privacy</code></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-violet-700 mb-1">Effective Date</label>
                <input type="date" value={privacyDate} onChange={e => setPrivacyDate(e.target.value)}
                  className="border border-violet-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
              </div>
            </div>
            <SectionEditor sections={privacySections} setSections={setPrivacy} />
          </div>
        )}

        {/* ── Terms of Service ── */}
        {activeTab === 'terms' && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Terms of Service</p>
                <p className="text-xs text-emerald-600 mt-0.5">{termsSections.length} sections · Saved to <code>legal/terms</code></p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-700 mb-1">Effective Date</label>
                <input type="date" value={termsDate} onChange={e => setTermsDate(e.target.value)}
                  className="border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white" />
              </div>
            </div>
            <SectionEditor sections={termsSections} setSections={setTerms} />
          </div>
        )}
      </div>

      {/* Floating save reminder when unsaved */}
      <div className="fixed bottom-6 right-6 z-40">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl text-sm font-bold shadow-xl shadow-primary/30 hover:bg-primary/90 transition disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
