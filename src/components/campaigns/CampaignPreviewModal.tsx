/**
 * CampaignPreviewModal
 * Shows how the campaign will look on the public UpBeat Heart website.
 * Uses the same color palette / typography from the PRD (Plus Jakarta Sans,
 * Medical Blue #1B6CA8, Teal #0EA5A8).
 */
import { X, Heart, Shield, CheckCircle, Share2, Phone, Building2, Play } from 'lucide-react'
import { useState } from 'react'
import type { Campaign, CampaignStatus } from '@/types'
import clsx from 'clsx'

interface Props {
  campaign: Campaign
  onClose: () => void
}

function progressPct(c: Campaign) {
  if (!c.estimatedCost) return 0
  return Math.min(100, Math.round((c.amountRaised / c.estimatedCost) * 100))
}

function fmtRupee(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN')
}

function StatusBanner({ status }: { status: CampaignStatus }) {
  if (status === 'active') return (
    <div className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
      Active — Accepting Donations
    </div>
  )
  if (status === 'completed') return (
    <div className="bg-teal-500 text-white text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
      <CheckCircle className="w-3.5 h-3.5" /> Goal Reached — Thank You!
    </div>
  )
  return null
}

export default function CampaignPreviewModal({ campaign, onClose }: Props) {
  const pct = progressPct(campaign)
  // photoIdx unused — media controlled by activeMedia
  const [activeMedia, setActiveMedia] = useState<string | null>(
    campaign.photos?.[0] ?? null
  )
  const allMedia = [...(campaign.photos ?? []), ...(campaign.videos ?? [])]
  const isVideo = (url: string) => /\.(mp4|mov|webm)/i.test(url) || url.includes('/video/')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[400] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4 overflow-hidden flex flex-col">

        {/* admin preview bar */}
        <div className="bg-gray-900 text-white px-5 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <div className="bg-gray-700 rounded-md px-3 py-1 text-xs text-gray-300 font-mono ml-3">
              upbeatheart.com/patient-assistance/{campaign.id}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400 font-medium bg-amber-400/10 px-2 py-1 rounded-md">Preview Mode</span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* scrollable website preview */}
        <div className="overflow-y-auto flex-1" style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>

          {/* hero / media section */}
          <div className="relative bg-gray-900">
            {activeMedia ? (
              isVideo(activeMedia) ? (
                <video src={activeMedia} controls className="w-full max-h-80 object-cover" />
              ) : (
                <img src={activeMedia} alt="" className="w-full h-72 object-cover" />
              )
            ) : (
              <div className="w-full h-72 flex items-center justify-center">
                <Heart className="w-16 h-16 text-gray-600" />
              </div>
            )}

            {/* overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

            {/* bottom-left info on hero */}
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-5">
              <StatusBanner status={campaign.status} />
              <h1 className="text-white text-2xl font-bold mt-2 leading-tight">
                Help {campaign.patientName} fight {campaign.diagnosis}
              </h1>
              {campaign.hospital && (
                <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> {campaign.hospital}
                </p>
              )}
            </div>
          </div>

          {/* thumbnail strip */}
          {allMedia.length > 1 && (
            <div className="bg-gray-900 px-6 pb-3 flex gap-2 overflow-x-auto">
              {allMedia.map((url, i) => (
                <button
                  key={url + i}
                  onClick={() => setActiveMedia(url)}
                  className={clsx(
                    'w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition',
                    activeMedia === url ? 'border-[#1B6CA8]' : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                >
                  {isVideo(url) ? (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white" fill="white" />
                    </div>
                  ) : (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* main content */}
          <div className="px-6 py-6 grid grid-cols-3 gap-6">

            {/* left: story */}
            <div className="col-span-2 space-y-6">

              {/* funding progress */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between text-sm mb-3">
                  <span className="font-semibold text-gray-900">Fundraising Progress</span>
                  <span className="font-bold text-[#1B6CA8]">{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
                  <div
                    className={clsx('h-2.5 rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : 'bg-[#1B6CA8]')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{fmtRupee(campaign.amountRaised)}</p>
                    <p className="text-xs text-gray-400">Raised</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-800">{fmtRupee(campaign.estimatedCost)}</p>
                    <p className="text-xs text-gray-400">Goal</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-rose-500">{fmtRupee(Math.max(0, campaign.estimatedCost - campaign.amountRaised))}</p>
                    <p className="text-xs text-gray-400">Remaining</p>
                  </div>
                </div>
              </div>

              {/* medical details */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#1B6CA8]" /> Medical Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Diagnosis</p>
                    <p className="font-semibold text-gray-800">{campaign.diagnosis}</p>
                  </div>
                  {campaign.treatmentRequired && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Treatment</p>
                      <p className="font-semibold text-gray-800">{campaign.treatmentRequired}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* patient story */}
              {campaign.patientStory && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3">About {campaign.patientName}</h3>
                  <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-wrap">{campaign.patientStory}</p>
                </div>
              )}

              {/* updates timeline */}
              {campaign.updates?.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-4">Campaign Updates</h3>
                  <div className="space-y-4">
                    {[...campaign.updates].reverse().map((u, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-[#1B6CA8]/10 flex items-center justify-center flex-shrink-0">
                            <Heart className="w-4 h-4 text-[#1B6CA8]" />
                          </div>
                          {i < campaign.updates.length - 1 && <div className="w-0.5 bg-gray-200 flex-1 my-2" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <p className="text-sm text-gray-700 leading-relaxed">{u.text}</p>
                          <p className="text-xs text-gray-400 mt-1">{new Date(u.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* right: action sidebar */}
            <div className="space-y-4">
              {/* donate CTA */}
              <div className="bg-[#1B6CA8] rounded-2xl p-5 text-white text-center shadow-lg">
                <p className="font-bold text-lg mb-1">Make a Difference</p>
                <p className="text-white/70 text-xs mb-4">100% goes to patient treatment</p>
                <button className="w-full bg-white text-[#1B6CA8] font-bold py-3 rounded-xl text-sm hover:bg-gray-100 transition mb-2">
                  Donate Now
                </button>
                <button className="w-full border border-white/30 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-white/10 transition flex items-center justify-center gap-2">
                  <Share2 className="w-3.5 h-3.5" /> Share Campaign
                </button>
              </div>

              {/* trust signals */}
              <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                {campaign.doctorVerified && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Doctor Verified</p>
                      <p className="text-xs text-gray-400">Medical need confirmed by cardiologist</p>
                    </div>
                  </div>
                )}
                {campaign.consentSigned && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Consent Obtained</p>
                      <p className="text-xs text-gray-400">Patient has authorized this campaign</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{campaign.hospital || 'CARE Hospital'}</p>
                    <p className="text-xs text-gray-400">Treating hospital</p>
                  </div>
                </div>
              </div>

              {/* contact box */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Need Help?</p>
                <button className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:border-[#1B6CA8]/40 transition">
                  <Phone className="w-3.5 h-3.5 text-[#1B6CA8]" /> Contact Doctor
                </button>
              </div>
            </div>
          </div>

          {/* preview footer note */}
          <div className="border-t border-gray-100 px-6 py-4 bg-amber-50 flex items-center gap-3">
            <AlertIcon />
            <p className="text-xs text-amber-700">
              <strong>Admin Preview</strong> — This is how the campaign will appear on <strong>upbeatheart.com</strong>.
              Status is currently <strong>{campaign.status.replace('_', ' ')}</strong>
              {campaign.status !== 'active' && campaign.status !== 'published'
                ? ' — campaign is not yet visible to the public.'
                : ' — campaign is live.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AlertIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
      <span className="text-amber-700 text-xs font-bold">!</span>
    </div>
  )
}
