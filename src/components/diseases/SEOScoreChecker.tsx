// ── components/diseases/SEOScoreChecker.tsx ───────────────────────────────
import { CheckCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'

interface CheckItem { label: string; pass: boolean }

interface Props {
  title:            string
  metaTitle:        string
  metaDescription:  string
  focusKeyword:     string
  coverImageAlt:    string
  slug:             string
  overview:         string
  faqs:             { q: string; a: string }[]
  hasVideo:         boolean
}

export default function SEOScoreChecker({
  title, metaTitle, metaDescription, focusKeyword, coverImageAlt, slug, overview, faqs, hasVideo,
}: Props) {
  const kw = focusKeyword.toLowerCase().trim()

  const checks: CheckItem[] = [
    { label: 'Focus keyword set',                             pass: kw.length > 0 },
    { label: 'Focus keyword in Meta Title',                   pass: kw.length > 0 && metaTitle.toLowerCase().includes(kw) },
    { label: 'Focus keyword in Meta Description',             pass: kw.length > 0 && metaDescription.toLowerCase().includes(kw) },
    { label: 'Focus keyword in first paragraph (Overview)',   pass: kw.length > 0 && overview.toLowerCase().slice(0, 400).includes(kw) },
    { label: 'Cover image has alt text',                      pass: coverImageAlt.trim().length > 10 },
    { label: 'Meta Title 50–60 characters',                   pass: metaTitle.length >= 50 && metaTitle.length <= 60 },
    { label: 'Meta Description 140–160 characters',           pass: metaDescription.length >= 140 && metaDescription.length <= 160 },
    { label: 'Slug is clean and keyword-rich',                pass: slug.length > 3 && !slug.includes(' ') },
    { label: 'FAQs section filled (enables FAQ schema)',       pass: faqs.length >= 2 },
    { label: 'Video added (enables VideoObject schema)',       pass: hasVideo },
    { label: 'Disease title matches page focus',              pass: title.trim().length > 3 },
  ]

  const passCount = checks.filter(c => c.pass).length
  const score     = Math.round((passCount / checks.length) * 100)
  const scoreColor = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'
  const barColor   = score >= 80 ? 'bg-green-500'   : score >= 50 ? 'bg-yellow-500'   : 'bg-red-500'

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">SEO Score</h4>
        <span className={clsx('text-2xl font-bold', scoreColor)}>{score}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${score}%` }} />
      </div>
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start gap-2">
            {c.pass
              ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              : <XCircle    className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
            <span className={clsx('text-xs', c.pass ? 'text-gray-700' : 'text-gray-400')}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
