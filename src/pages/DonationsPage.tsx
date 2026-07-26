import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  collection, getDocs, orderBy, query,
  doc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Donation, PaymentMethod, DonationSource } from '@/types'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns'
import {
  Plus, X, Search, Filter, Download, IndianRupee,
  CreditCard, Banknote, Smartphone, Building, Users,
  CheckCircle, XCircle, Clock, FileText,
  TrendingUp, Calendar, ChevronDown, ChevronUp,
  Printer, ReceiptText, StickyNote, Edit2, Trash2,
  AlertTriangle, BarChart2, List, LayoutGrid,
  ArrowUpRight, RefreshCw,
} from 'lucide-react'

/* ─── constants ──────────────────────────────────────── */
const METHOD_CFG: Record<PaymentMethod, { label: string; icon: any; color: string; bg: string; border: string }> = {
  razorpay:        { label: 'Razorpay',       icon: CreditCard,  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  cash:            { label: 'Cash',            icon: Banknote,    color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200'  },
  upi:             { label: 'UPI',             icon: Smartphone,  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  cheque:          { label: 'Cheque',          icon: FileText,    color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  bank_transfer:   { label: 'Bank Transfer',   icon: Building,    color: 'text-teal-600',   bg: 'bg-teal-50',   border: 'border-teal-200'   },
  ngo_sponsorship: { label: 'NGO Sponsorship', icon: Users,       color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200'   },
  hospital:        { label: 'Hospital',        icon: Building,    color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
}

const STATUS_CFG = {
  paid:    { label: 'Paid',    icon: CheckCircle, cls: 'bg-green-50 text-green-700 border-green-200'   },
  failed:  { label: 'Failed',  icon: XCircle,     cls: 'bg-red-50 text-red-700 border-red-200'         },
  created: { label: 'Pending', icon: Clock,       cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

const BLANK_FORM = {
  donorName: '', donorEmail: '', donorPhone: '',
  campaignId: '', campaignName: '',
  amount: '', paymentMethod: 'cash' as PaymentMethod,
  upiTransactionId: '', chequeNumber: '',
  bankName: '', bankAccount: '', ifscCode: '',
  receiptNumber: '', collectedBy: '', notes: '',
  anonymous: false,
  donationDate: format(new Date(), 'yyyy-MM-dd'),
}

/* ─── helpers ────────────────────────────────────────── */
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

function tsToDate(val: any): string {
  if (!val) return ''
  if (val instanceof Timestamp) return val.toDate().toISOString()
  return String(val)
}

function autoReceiptNumber() {
  const now = new Date()
  return `RCP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`
}

function getInitial(name: string) {
  return (name?.[0] ?? '?').toUpperCase()
}

/* ─── Receipt Printer ────────────────────────────────── */
function printReceipt(d: Donation) {
  const methodLabel = METHOD_CFG[d.paymentMethod ?? 'razorpay']?.label ?? d.paymentMethod
  const dateStr = d.createdAt ? format(new Date(d.createdAt), 'dd MMMM yyyy') : format(new Date(), 'dd MMMM yyyy')
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Donation Receipt – ${d.receiptNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #1B6CA8; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 800; color: #1B6CA8; letter-spacing: -0.5px; }
    .tagline { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .receipt-title { font-size: 16px; font-weight: 700; color: #374151; margin-top: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .receipt-num { font-size: 13px; color: #6b7280; margin-top: 4px; font-family: monospace; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .row .label { color: #6b7280; }
    .row .value { font-weight: 600; color: #111827; text-align: right; }
    .amount-box { background: #EBF4FB; border: 1px solid #1B6CA8; border-radius: 10px; padding: 16px 20px; text-align: center; margin: 20px 0; }
    .amount-label { font-size: 12px; color: #1B6CA8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .amount-value { font-size: 32px; font-weight: 800; color: #1B6CA8; margin-top: 4px; }
    .footer { margin-top: 32px; border-top: 1px dashed #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.8; }
    .thank-you { font-size: 14px; font-weight: 600; color: #374151; text-align: center; margin: 16px 0 8px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">❤ UpBeat Heart</div>
    <div class="tagline">Compassionate Cardiology Care</div>
    <div class="receipt-title">Donation Receipt</div>
    <div class="receipt-num">${d.receiptNumber || '—'}</div>
  </div>

  <div class="amount-box">
    <div class="amount-label">Amount Donated</div>
    <div class="amount-value">${inr(d.amount)}</div>
  </div>

  <div class="section">
    <div class="section-title">Donor Details</div>
    <div class="row"><span class="label">Name</span><span class="value">${d.anonymous ? 'Anonymous' : d.donorName}</span></div>
    ${d.donorPhone ? `<div class="row"><span class="label">Phone</span><span class="value">${d.donorPhone}</span></div>` : ''}
    ${d.donorEmail ? `<div class="row"><span class="label">Email</span><span class="value">${d.donorEmail}</span></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Payment Details</div>
    <div class="row"><span class="label">Date</span><span class="value">${dateStr}</span></div>
    <div class="row"><span class="label">Method</span><span class="value">${methodLabel}</span></div>
    <div class="row"><span class="label">Status</span><span class="value">${STATUS_CFG[d.status].label}</span></div>
    ${d.upiTransactionId ? `<div class="row"><span class="label">UPI Txn ID</span><span class="value" style="font-family:monospace">${d.upiTransactionId}</span></div>` : ''}
    ${d.chequeNumber ? `<div class="row"><span class="label">Cheque #</span><span class="value" style="font-family:monospace">${d.chequeNumber}</span></div>` : ''}
    ${d.razorpayPaymentId ? `<div class="row"><span class="label">Razorpay ID</span><span class="value" style="font-family:monospace;font-size:11px">${d.razorpayPaymentId}</span></div>` : ''}
  </div>

  ${d.campaignName ? `<div class="section">
    <div class="section-title">Campaign</div>
    <div class="row"><span class="label">Linked Campaign</span><span class="value">${d.campaignName}</span></div>
  </div>` : ''}

  ${d.collectedBy ? `<div class="section">
    <div class="section-title">Recorded By</div>
    <div class="row"><span class="label">Collected By</span><span class="value">${d.collectedBy}</span></div>
  </div>` : ''}

  <div class="thank-you">🙏 Thank you for your generous contribution!</div>
  <div class="footer">
    This is a computer-generated receipt. UpBeat Heart Platform.<br>
    upbeatheart.com &nbsp;|&nbsp; Generated on ${format(new Date(), 'dd MMM yyyy, h:mm a')}
  </div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=600,height=700')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }
}

/* ─── sub-components ─────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color, onClick }: {
  label: string; value: string; sub?: string; icon: any; color: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-2xl border border-gray-100 shadow-card p-5 flex items-start gap-4',
        onClick && 'cursor-pointer hover:shadow-md hover:border-gray-200 transition'
      )}
    >
      <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function MethodBadge({ method }: { method: PaymentMethod }) {
  const cfg = METHOD_CFG[method]
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.color, cfg.bg)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function StatusBadge({ status }: { status: Donation['status'] }) {
  const cfg = STATUS_CFG[status]
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', cfg.cls)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

/* ─── Mini Bar Chart ─────────────────────────────────── */
function TrendChart({ donations }: { donations: Donation[] }) {
  const months = useMemo(() => {
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const start = startOfMonth(d)
      const end = endOfMonth(d)
      const total = donations
        .filter(don => {
          if (!don.createdAt || don.status !== 'paid') return false
          try {
            const dt = parseISO(don.createdAt)
            return isWithinInterval(dt, { start, end })
          } catch { return false }
        })
        .reduce((s, don) => s + don.amount, 0)
      result.push({ label: format(d, 'MMM'), total })
    }
    return result
  }, [donations])

  const max = Math.max(...months.map(m => m.total), 1)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-gray-800">6-Month Donation Trend</p>
          <p className="text-xs text-gray-400">Paid donations only</p>
        </div>
        <BarChart2 className="w-4 h-4 text-gray-300" />
      </div>
      <div className="flex items-end gap-2 h-28">
        {months.map((m, i) => {
          const pct = max > 0 ? (m.total / max) * 100 : 0
          const isLast = i === months.length - 1
          return (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
              <p className="text-[10px] text-gray-500 font-medium">{m.total > 0 ? `₹${Math.round(m.total / 1000)}k` : ''}</p>
              <div className="w-full flex items-end" style={{ height: 72 }}>
                <div
                  className={clsx(
                    'w-full rounded-t-lg transition-all',
                    isLast ? 'bg-primary' : 'bg-primary-50'
                  )}
                  style={{ height: `${Math.max(pct, m.total > 0 ? 4 : 0)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400">{m.label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Detail panel (expanded row) ────────────────────── */
function DonationDetail({ donation }: { donation: Donation }) {
  return (
    <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      {donation.donorEmail && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Email</p>
          <p className="text-gray-700">{donation.donorEmail}</p>
        </div>
      )}
      {donation.donorPhone && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Phone</p>
          <p className="text-gray-700">{donation.donorPhone}</p>
        </div>
      )}
      {donation.receiptNumber && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Receipt #</p>
          <p className="text-gray-700 font-mono">{donation.receiptNumber}</p>
        </div>
      )}
      {donation.upiTransactionId && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">UPI Txn ID</p>
          <p className="text-gray-700 font-mono text-xs">{donation.upiTransactionId}</p>
        </div>
      )}
      {donation.chequeNumber && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Cheque #</p>
          <p className="text-gray-700 font-mono">{donation.chequeNumber}</p>
        </div>
      )}
      {(donation as any).bankName && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Bank</p>
          <p className="text-gray-700">{(donation as any).bankName}</p>
        </div>
      )}
      {(donation as any).ifscCode && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">IFSC</p>
          <p className="text-gray-700 font-mono">{(donation as any).ifscCode}</p>
        </div>
      )}
      {donation.razorpayPaymentId && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Razorpay ID</p>
          <p className="text-gray-700 font-mono text-xs">{donation.razorpayPaymentId}</p>
        </div>
      )}
      {donation.collectedBy && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Collected By</p>
          <p className="text-gray-700">{donation.collectedBy}</p>
        </div>
      )}
      {donation.source && (
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Source</p>
          <p className="text-gray-700 capitalize">{donation.source}</p>
        </div>
      )}
      {donation.notes && (
        <div className="col-span-2 md:col-span-4">
          <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Notes</p>
          <p className="text-gray-700">{donation.notes}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Donor Wall</p>
        <p className={donation.showOnWebsite ? 'text-green-600 text-sm font-semibold' : 'text-gray-400 text-sm'}>
          {donation.showOnWebsite ? '✓ Shown on website' : 'Not shown on website'}
        </p>
      </div>
    </div>
  )
}

/* ─── Delete Confirm Modal ───────────────────────────── */
function DeleteModal({ donation, onCancel, onConfirm, loading }: {
  donation: Donation; onCancel: () => void; onConfirm: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="font-bold text-gray-900">Delete Donation?</p>
            <p className="text-xs text-gray-500">This action cannot be undone</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 mb-5 text-sm">
          <p className="text-gray-700 font-medium">{donation.anonymous ? 'Anonymous' : donation.donorName}</p>
          <p className="text-gray-500 text-xs mt-0.5">{inr(donation.amount)} · {donation.receiptNumber || '—'}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Row ─────────────────────────────────────────────── */
function DonationRow({ donation, onStatusChange, onToggleWebsite, onEdit, onDelete, onPrint }: {
  donation: Donation
  onStatusChange: (id: string, status: Donation['status']) => void
  onToggleWebsite: (id: string, show: boolean) => void
  onEdit: (d: Donation) => void
  onDelete: (d: Donation) => void
  onPrint: (d: Donation) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasExtra = donation.donorEmail || donation.donorPhone || donation.receiptNumber ||
    donation.upiTransactionId || donation.chequeNumber || donation.razorpayPaymentId ||
    (donation as any).bankName || donation.collectedBy || donation.notes

  return (
    <>
      <tr
        className={clsx('hover:bg-gray-50/50 transition cursor-pointer', expanded && 'bg-primary-50/20')}
        onClick={() => hasExtra && setExpanded(p => !p)}
      >
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0 text-primary font-bold text-xs">
              {donation.anonymous ? '?' : getInitial(donation.donorName)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 leading-tight">
                {donation.anonymous ? 'Anonymous' : donation.donorName}
              </p>
              {donation.source === 'manual' && (
                <span className="text-[10px] text-orange-500 font-medium">Manual</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[160px] truncate">
          {donation.campaignName || <span className="text-gray-300">—</span>}
        </td>
        <td className="px-5 py-3.5">
          <p className="text-sm font-bold text-gray-900">{inr(donation.amount)}</p>
        </td>
        <td className="px-5 py-3.5">
          <MethodBadge method={donation.paymentMethod ?? 'razorpay'} />
        </td>
        <td className="px-5 py-3.5">
          <StatusBadge status={donation.status} />
        </td>
        <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">
          {donation.createdAt ? format(new Date(donation.createdAt), 'dd MMM yyyy') : '—'}
        </td>
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <select
              value={donation.status}
              onChange={e => onStatusChange(donation.id, e.target.value as Donation['status'])}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="paid">Paid</option>
              <option value="created">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <button
              onClick={() => onToggleWebsite(donation.id, !donation.showOnWebsite)}
              title={donation.showOnWebsite ? 'Remove from donor wall' : 'Approve for donor wall'}
              className={clsx(
                'p-1.5 rounded-lg transition text-xs font-bold border',
                donation.showOnWebsite
                  ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-primary-50 hover:text-primary hover:border-primary/30'
              )}
            >
              {donation.showOnWebsite ? '✓ Wall' : '+ Wall'}
            </button>
            <button
              onClick={() => onPrint(donation)}
              title="Print Receipt"
              className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary-50 rounded-lg transition"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            {donation.source === 'manual' && (
              <>
                <button
                  onClick={() => onEdit(donation)}
                  title="Edit"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(donation)}
                  title="Delete"
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {hasExtra && (
              <button className="p-1.5 text-gray-400 hover:text-primary rounded-lg transition">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasExtra && (
        <tr>
          <td colSpan={7} className="p-0">
            <DonationDetail donation={donation} />
          </td>
        </tr>
      )}
    </>
  )
}

/* ─── Campaign Group View ─────────────────────────────── */
function CampaignGroupView({ donations, onStatusChange, onToggleWebsite, onEdit, onDelete, onPrint }: {
  donations: Donation[]
  onStatusChange: (id: string, status: Donation['status']) => void
  onToggleWebsite: (id: string, show: boolean) => void
  onEdit: (d: Donation) => void
  onDelete: (d: Donation) => void
  onPrint: (d: Donation) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const map: Record<string, { name: string; donations: Donation[]; total: number }> = {}
    donations.forEach(d => {
      const key = d.campaignId || '__general__'
      const name = d.campaignName || 'General Donations'
      if (!map[key]) map[key] = { name, donations: [], total: 0 }
      map[key].donations.push(d)
      if (d.status === 'paid') map[key].total += d.amount
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [donations])

  return (
    <div className="space-y-3">
      {groups.map(([key, group]) => (
        <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
          <button
            onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">{group.name}</p>
                <p className="text-xs text-gray-400">{group.donations.length} donation{group.donations.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-base font-bold text-primary">{inr(group.total)}</p>
              {expanded[key] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {expanded[key] && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Donor', 'Amount', 'Method', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {group.donations.map(d => (
                    <DonationRow key={d.id} donation={d} onStatusChange={onStatusChange} onToggleWebsite={onToggleWebsite} onEdit={onEdit} onDelete={onDelete} onPrint={onPrint} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Add/Edit Drawer ─────────────────────────────────── */
function DonationDrawer({
  campaigns,
  editDonation,
  onClose,
  onSaved,
}: {
  campaigns: { id: string; name: string }[]
  editDonation: Donation | null
  onClose: () => void
  onSaved: (d: Donation, isEdit: boolean) => void
}) {
  const isEdit = !!editDonation
  const [form, setForm] = useState(() => {
    if (editDonation) {
      return {
        donorName: editDonation.donorName === 'Anonymous' ? '' : (editDonation.donorName || ''),
        donorEmail: editDonation.donorEmail || '',
        donorPhone: editDonation.donorPhone || '',
        campaignId: editDonation.campaignId || '',
        campaignName: editDonation.campaignName || '',
        amount: String(editDonation.amount),
        paymentMethod: editDonation.paymentMethod ?? 'cash',
        upiTransactionId: editDonation.upiTransactionId || '',
        chequeNumber: editDonation.chequeNumber || '',
        bankName: (editDonation as any).bankName || '',
        bankAccount: (editDonation as any).bankAccount || '',
        ifscCode: (editDonation as any).ifscCode || '',
        receiptNumber: editDonation.receiptNumber || '',
        collectedBy: editDonation.collectedBy || '',
        notes: editDonation.notes || '',
        anonymous: editDonation.anonymous,
        donationDate: editDonation.createdAt ? format(new Date(editDonation.createdAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      }
    }
    return BLANK_FORM
  })
  const [saving, setSaving] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [showCampaignList, setShowCampaignList] = useState(false)

  const setF = (key: keyof typeof BLANK_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(campaignSearch.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!form.donorName.trim() && !form.anonymous) return toast.error('Donor name required')
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      return toast.error('Enter a valid amount')

    setSaving(true)
    try {
      const receipt = form.receiptNumber || (isEdit ? editDonation!.receiptNumber : autoReceiptNumber()) || autoReceiptNumber()
      const payload: any = {
        showOnWebsite:    false,   // admin must explicitly approve via +Wall button
        showAmountPublic: false,
        donorName:        form.anonymous ? 'Anonymous' : form.donorName.trim(),
        donorEmail:       form.donorEmail.trim() || null,
        donorPhone:       form.donorPhone.trim() || null,
        campaignId:       form.campaignId,
        campaignName:     form.campaignName,
        amount:           Number(form.amount),
        paymentMethod:    form.paymentMethod,
        source:           'manual',
        status:           'paid',
        anonymous:        form.anonymous,
        receiptNumber:    receipt,
        upiTransactionId: form.paymentMethod === 'upi'          ? (form.upiTransactionId || null)  : null,
        chequeNumber:     form.paymentMethod === 'cheque'       ? (form.chequeNumber || null)       : null,
        bankName:         form.paymentMethod === 'bank_transfer' ? (form.bankName || null)          : null,
        bankAccount:      form.paymentMethod === 'bank_transfer' ? (form.bankAccount || null)       : null,
        ifscCode:         form.paymentMethod === 'bank_transfer' ? (form.ifscCode || null)          : null,
        collectedBy:      form.collectedBy.trim() || null,
        notes:            form.notes.trim() || null,
      }

      if (isEdit) {
        await updateDoc(doc(db, 'donations', editDonation!.id), payload)
        onSaved({ id: editDonation!.id, ...payload, createdAt: editDonation!.createdAt }, true)
        toast.success('Donation updated')
      } else {
        const ref = await addDoc(collection(db, 'donations'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        // update campaign amountRaised if linked
        if (form.campaignId) {
          try {
            const campSnap = await getDocs(query(collection(db, 'campaigns')))
            const camp = campSnap.docs.find(d => d.id === form.campaignId)
            if (camp) {
              const current = camp.data().amountRaised ?? 0
              await updateDoc(doc(db, 'campaigns', form.campaignId), {
                amountRaised: current + Number(form.amount),
              })
            }
          } catch { /* non-critical */ }
        }
        onSaved({ id: ref.id, ...payload, createdAt: new Date().toISOString() }, false)
        toast.success(`Donation recorded — Receipt: ${receipt}`)
      }
      onClose()
    } catch (err: any) {
      toast.error(isEdit ? 'Failed to update donation' : 'Failed to save donation')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const method = form.paymentMethod

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary" />
              {isEdit ? 'Edit Donation' : 'Record Manual Donation'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit ? `Editing ${editDonation!.receiptNumber || '—'}` : 'Cash, UPI, Cheque, Bank Transfer, NGO Sponsorship'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* payment method selector */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">Payment Method *</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(METHOD_CFG) as [PaymentMethod, typeof METHOD_CFG[PaymentMethod]][])
                .filter(([k]) => k !== 'razorpay')
                .map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <button
                      key={key}
                      onClick={() => setForm(p => ({ ...p, paymentMethod: key }))}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-medium transition',
                        method === key
                          ? `border-primary bg-primary-50 text-primary`
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  )
                })}
            </div>
          </div>

          {/* amount + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Amount (₹) *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number" placeholder="0"
                  value={form.amount} onChange={setF('amount')}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Donation Date *</label>
              <input
                type="date" value={form.donationDate} onChange={setF('donationDate')}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* campaign linkage */}
          <div className="relative">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Linked Campaign</label>
            <input
              placeholder="Search campaign name…"
              value={form.campaignName || campaignSearch}
              onChange={e => {
                setCampaignSearch(e.target.value)
                setForm(p => ({ ...p, campaignId: '', campaignName: '' }))
                setShowCampaignList(true)
              }}
              onFocus={() => setShowCampaignList(true)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {showCampaignList && filteredCampaigns.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto">
                <button
                  onClick={() => { setForm(p => ({ ...p, campaignId: '', campaignName: '' })); setCampaignSearch(''); setShowCampaignList(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                >
                  No campaign (general donation)
                </button>
                {filteredCampaigns.map(c => (
                  <button key={c.id} onClick={() => {
                    setForm(p => ({ ...p, campaignId: c.id, campaignName: c.name }))
                    setCampaignSearch('')
                    setShowCampaignList(false)
                  }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary transition"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* donor info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">Donor Information</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.anonymous}
                  onChange={e => setForm(p => ({ ...p, anonymous: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-xs text-gray-500">Anonymous</span>
              </label>
            </div>
            {!form.anonymous && (
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Full Name *" value={form.donorName} onChange={setF('donorName')}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <input placeholder="Phone" value={form.donorPhone} onChange={setF('donorPhone')}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <input placeholder="Email" value={form.donorEmail} onChange={setF('donorEmail')}
                  className="col-span-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}
          </div>

          {/* method-specific fields */}
          {method === 'upi' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">UPI Transaction ID</label>
              <input placeholder="e.g. 3256XXXXXXX" value={form.upiTransactionId} onChange={setF('upiTransactionId')}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            </div>
          )}
          {method === 'cheque' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Cheque Number</label>
              <input placeholder="e.g. 012345" value={form.chequeNumber} onChange={setF('chequeNumber')}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            </div>
          )}
          {method === 'bank_transfer' && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-600 block">Bank Transfer Details</label>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Bank Name" value={form.bankName} onChange={setF('bankName')}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <input placeholder="IFSC Code" value={form.ifscCode} onChange={setF('ifscCode')}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono uppercase" />
                <input placeholder="Last 4 digits of account" maxLength={4} value={form.bankAccount} onChange={setF('bankAccount')}
                  className="col-span-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
              </div>
            </div>
          )}

          {/* receipt + collected by */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                Receipt # <span className="font-normal text-gray-400">(auto if blank)</span>
              </label>
              <input placeholder="RCP-2025-XXXX" value={form.receiptNumber} onChange={setF('receiptNumber')}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Collected By</label>
              <input placeholder="Admin name" value={form.collectedBy} onChange={setF('collectedBy')}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* notes */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
            <textarea
              placeholder="Any additional context or remarks…"
              value={form.notes} onChange={setF('notes')}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        {/* footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <button
            onClick={handleSubmit} disabled={saving}
            className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark disabled:opacity-60 transition flex items-center justify-center gap-2"
          >
            <ReceiptText className="w-4 h-4" />
            {saving ? (isEdit ? 'Saving…' : 'Recording…') : (isEdit ? 'Save Changes' : 'Record Donation')}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── CSV Export ──────────────────────────────────────── */
function exportCSV(donations: Donation[]) {
  const headers = ['Date', 'Donor', 'Phone', 'Email', 'Campaign', 'Amount', 'Method', 'Status', 'Receipt #', 'UPI Txn ID', 'Cheque #', 'Collected By', 'Notes']
  const rows = donations.map(d => [
    d.createdAt ? format(new Date(d.createdAt), 'dd/MM/yyyy') : '',
    d.anonymous ? 'Anonymous' : d.donorName,
    d.donorPhone || '',
    d.donorEmail || '',
    d.campaignName || '',
    d.amount,
    METHOD_CFG[d.paymentMethod ?? 'razorpay']?.label ?? d.paymentMethod,
    d.status,
    d.receiptNumber || '',
    d.upiTransactionId || '',
    d.chequeNumber || '',
    d.collectedBy || '',
    (d.notes || '').replace(/,/g, ';'),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `donations-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('CSV exported')
}

/* ─── MAIN PAGE ───────────────────────────────────────── */
export default function DonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [editDonation, setEditDonation] = useState<Donation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Donation | null>(null)
  const [deleting, setDeleting] = useState(false)

  // filters
  const [search, setSearch] = useState('')
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<Donation['status'] | 'all'>('all')
  const [filterSource, setFilterSource] = useState<DonationSource | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // view mode
  const [viewMode, setViewMode] = useState<'list' | 'campaign'>('list')

  /* fetch */
  const load = useCallback(async () => {
    setLoading(true)
    const [donSnap, campSnap] = await Promise.all([
      getDocs(query(collection(db, 'donations'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'campaigns'))),
    ])
    setDonations(donSnap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id, ...data,
        paymentMethod: data.paymentMethod ?? 'razorpay',
        source: data.source ?? 'online',
        showOnWebsite: data.showOnWebsite ?? false,
        showAmountPublic: data.showAmountPublic ?? false,
        createdAt: tsToDate(data.createdAt),
      } as Donation
    }))
    setCampaigns(campSnap.docs.map(d => ({ id: d.id, name: d.data().patientName ?? d.data().title ?? 'Campaign' })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /* stats */
  const stats = useMemo(() => {
    const paid = donations.filter(d => d.status === 'paid')
    const total = paid.reduce((s, d) => s + d.amount, 0)
    const thisMonth = paid.filter(d => {
      if (!d.createdAt) return false
      const dt = new Date(d.createdAt)
      const now = new Date()
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
    }).reduce((s, d) => s + d.amount, 0)
    const manual = donations.filter(d => d.source === 'manual').length
    const online = donations.filter(d => d.source !== 'manual').length
    const byMethod: Partial<Record<PaymentMethod, number>> = {}
    paid.forEach(d => {
      const m = d.paymentMethod ?? 'razorpay'
      byMethod[m] = (byMethod[m] ?? 0) + d.amount
    })
    const uniqueDonors = new Set(
      donations.filter(d => !d.anonymous && d.donorName).map(d => d.donorName.toLowerCase())
    ).size

    return { total, thisMonth, manual, online, count: paid.length, byMethod, uniqueDonors }
  }, [donations])

  /* filtered */
  const filtered = useMemo(() => {
    let list = donations.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        (!d.anonymous && d.donorName?.toLowerCase().includes(q)) ||
        d.campaignName?.toLowerCase().includes(q) ||
        d.receiptNumber?.toLowerCase().includes(q) ||
        d.donorPhone?.includes(q)
      const matchMethod = filterMethod === 'all' || (d.paymentMethod ?? 'razorpay') === filterMethod
      const matchStatus = filterStatus === 'all' || d.status === filterStatus
      const matchSource = filterSource === 'all' || (d.source ?? 'online') === filterSource
      let matchDate = true
      if (dateFrom && d.createdAt) {
        matchDate = new Date(d.createdAt) >= new Date(dateFrom)
      }
      if (dateTo && d.createdAt && matchDate) {
        matchDate = new Date(d.createdAt) <= new Date(dateTo + 'T23:59:59')
      }
      return matchSearch && matchMethod && matchStatus && matchSource && matchDate
    })
    if (!sortDesc) list = [...list].reverse()
    return list
  }, [donations, search, filterMethod, filterStatus, filterSource, dateFrom, dateTo, sortDesc])

  const updateStatus = async (id: string, status: Donation['status']) => {
    await updateDoc(doc(db, 'donations', id), { status })
    setDonations(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    toast.success('Status updated')
  }

  const toggleWebsite = async (id: string, show: boolean) => {
    await updateDoc(doc(db, 'donations', id), { showOnWebsite: show })
    setDonations(prev => prev.map(d => d.id === id ? { ...d, showOnWebsite: show } : d))
    toast.success(show ? 'Added to donor wall ✓' : 'Removed from donor wall')
  }

  const handleSaved = (saved: Donation, isEdit: boolean) => {
    if (isEdit) {
      setDonations(prev => prev.map(d => d.id === saved.id ? saved : d))
    } else {
      setDonations(prev => [saved, ...prev])
    }
    setEditDonation(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'donations', deleteTarget.id))
      setDonations(prev => prev.filter(d => d.id !== deleteTarget.id))
      toast.success('Donation deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const topMethod = Object.entries(stats.byMethod).sort((a, b) => b[1] - a[1])[0]
  const hasActiveFilters = filterMethod !== 'all' || filterStatus !== 'all' || filterSource !== 'all' || dateFrom || dateTo

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Donations</h1>
          <p className="text-sm text-gray-500 mt-0.5">All donation records — online and manual</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2.5 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => { setEditDonation(null); setShowDrawer(true) }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record Donation
          </button>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={IndianRupee} label="Total Collected" color="bg-green-50 text-green-600"
          value={inr(stats.total)}
          sub={`${stats.count} paid donations`}
        />
        <StatCard
          icon={Calendar} label="This Month" color="bg-primary-50 text-primary"
          value={inr(stats.thisMonth)}
        />
        <StatCard
          icon={Users} label="Unique Donors" color="bg-purple-50 text-purple-600"
          value={String(stats.uniqueDonors)}
          sub={`${stats.manual} manual · ${stats.online} online`}
        />
        <StatCard
          icon={TrendingUp} label="Top Method" color="bg-orange-50 text-orange-600"
          value={topMethod ? METHOD_CFG[topMethod[0] as PaymentMethod]?.label ?? '—' : '—'}
          sub={topMethod ? inr(topMethod[1]) : undefined}
        />
      </div>

      {/* trend chart + method breakdown */}
      {!loading && donations.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TrendChart donations={donations} />

          {/* method breakdown */}
          {Object.keys(stats.byMethod).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-gray-800">Collection by Method</p>
                <ArrowUpRight className="w-4 h-4 text-gray-300" />
              </div>
              <div className="space-y-2.5">
                {(Object.entries(stats.byMethod) as [PaymentMethod, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amt]) => {
                    const cfg = METHOD_CFG[method]
                    const Icon = cfg.icon
                    const pct = stats.total > 0 ? Math.round((amt / stats.total) * 100) : 0
                    return (
                      <div key={method} className="flex items-center gap-3">
                        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                          <Icon className={clsx('w-3.5 h-3.5', cfg.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-gray-700">{cfg.label}</p>
                            <p className="text-xs font-bold text-gray-900">{inr(amt)}</p>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={clsx('h-full rounded-full transition-all', cfg.bg.replace('bg-', 'bg-').replace('-50', '-400'))}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 shrink-0 w-9 text-right">{pct}%</p>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* search + filters + view toggle */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search donor, campaign, receipt, phone…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition',
              showFilters || hasActiveFilters
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-white/60" />}
          </button>
          <button
            onClick={() => setSortDesc(p => !p)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white text-gray-600 border border-gray-200 hover:border-gray-300 transition"
          >
            {sortDesc ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            {sortDesc ? 'Newest' : 'Oldest'}
          </button>
          {/* view mode */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setViewMode('list')}
              className={clsx('px-3 py-2.5 transition', viewMode === 'list' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600')}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('campaign')}
              className={clsx('px-3 py-2.5 transition', viewMode === 'campaign' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
            {/* status */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'paid', 'created', 'failed'] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={clsx('px-3 py-1.5 rounded-xl text-xs font-medium border transition capitalize',
                      filterStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                    {s === 'all' ? 'All' : s === 'created' ? 'Pending' : s}
                  </button>
                ))}
              </div>
            </div>
            {/* source */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Source</p>
              <div className="flex gap-2">
                {(['all', 'online', 'manual'] as const).map(s => (
                  <button key={s} onClick={() => setFilterSource(s)}
                    className={clsx('px-3 py-1.5 rounded-xl text-xs font-medium border transition capitalize',
                      filterSource === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>
            {/* method */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Payment Method</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilterMethod('all')}
                  className={clsx('px-3 py-1.5 rounded-xl text-xs font-medium border transition',
                    filterMethod === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                  All
                </button>
                {(Object.entries(METHOD_CFG) as [PaymentMethod, typeof METHOD_CFG[PaymentMethod]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFilterMethod(key)}
                    className={clsx('px-3 py-1.5 rounded-xl text-xs font-medium border transition',
                      filterMethod === key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
            {/* date range */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Date Range</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterMethod('all'); setFilterStatus('all'); setFilterSource('all'); setDateFrom(''); setDateTo('') }}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1.5 transition"
              >
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading donations…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card flex flex-col items-center justify-center py-20 text-center">
          <IndianRupee className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">
            {search || hasActiveFilters ? 'No donations match your filters' : 'No donations recorded yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">Click "Record Donation" to add the first manual entry</p>
        </div>
      ) : viewMode === 'campaign' ? (
        <CampaignGroupView
          donations={filtered}
          onStatusChange={updateStatus}
          onToggleWebsite={toggleWebsite}
          onEdit={d => { setEditDonation(d); setShowDrawer(true) }}
          onDelete={setDeleteTarget}
          onPrint={printReceipt}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Donor', 'Campaign', 'Amount', 'Method', 'Status', 'Date', 'Approve / Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(d => (
                  <DonationRow
                    key={d.id}
                    donation={d}
                    onStatusChange={updateStatus}
                    onToggleWebsite={toggleWebsite}
                    onEdit={d => { setEditDonation(d); setShowDrawer(true) }}
                    onDelete={setDeleteTarget}
                    onPrint={printReceipt}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing {filtered.length} of {donations.length} records
            </p>
            <p className="text-xs font-semibold text-gray-600">
              Filtered total: {inr(filtered.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0))}
            </p>
          </div>
        </div>
      )}

      {/* Drawer — add or edit */}
      {showDrawer && (
        <DonationDrawer
          campaigns={campaigns}
          editDonation={editDonation}
          onClose={() => { setShowDrawer(false); setEditDonation(null) }}
          onSaved={handleSaved}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteModal
          donation={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
    </div>
  )
}
