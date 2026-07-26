import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Blog, ContentStatus } from '@/types'
import { format } from 'date-fns'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Filter, Eye, Pencil, Trash2,
  BookOpen, TrendingUp, Clock, CheckCircle, Archive,
} from 'lucide-react'

const STATUS_META: Record<ContentStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:            { label: 'Draft',            color: 'bg-gray-50 text-gray-600 border-gray-200',     icon: Clock },
  pending_approval: { label: 'Pending Approval', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: TrendingUp },
  published:        { label: 'Published',        color: 'bg-green-50 text-green-700 border-green-200',   icon: CheckCircle },
  archived:         { label: 'Archived',         color: 'bg-red-50 text-red-700 border-red-200',         icon: Archive },
}

export default function BlogsListPage() {
  const [blogs, setBlogs]       = useState<Blog[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilter] = useState<ContentStatus | 'all'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadBlogs()
  }, [])

  async function loadBlogs() {
    setLoading(true)
    const q    = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    setBlogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Blog)))
    setLoading(false)
  }

  const updateStatus = async (id: string, status: ContentStatus) => {
    await updateDoc(doc(db, 'blogs', id), { status })
    setBlogs(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    toast.success(`Blog marked as ${STATUS_META[status].label}`)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    await deleteDoc(doc(db, 'blogs', id))
    setBlogs(prev => prev.filter(b => b.id !== id))
    setDeleting(null)
    toast.success('Blog deleted')
  }

  const counts = {
    all:              blogs.length,
    draft:            blogs.filter(b => b.status === 'draft').length,
    pending_approval: blogs.filter(b => b.status === 'pending_approval').length,
    published:        blogs.filter(b => b.status === 'published').length,
    archived:         blogs.filter(b => b.status === 'archived').length,
  }

  const visible = blogs
    .filter(b => filterStatus === 'all' || b.status === filterStatus)
    .filter(b => !search || b.title.toLowerCase().includes(search.toLowerCase()) || (b.category || '').toLowerCase().includes(search.toLowerCase()))

  const tabs: { key: ContentStatus | 'all'; label: string }[] = [
    { key: 'all',              label: `All (${counts.all})` },
    { key: 'draft',            label: `Draft (${counts.draft})` },
    { key: 'pending_approval', label: `Pending (${counts.pending_approval})` },
    { key: 'published',        label: `Published (${counts.published})` },
    { key: 'archived',         label: `Archived (${counts.archived})` },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Blog Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Create medical educational content — every blog is doctor-approved before publishing.
          </p>
        </div>
        <Link
          to="/blogs/new"
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20 shrink-0"
        >
          <Plus className="w-4 h-4" /> New Blog Post
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['draft','pending_approval','published','archived'] as ContentStatus[]).map(s => {
          const m = STATUS_META[s]
          const Icon = m.icon
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={clsx(
                'rounded-2xl border p-4 text-left transition hover:shadow-md',
                filterStatus === s ? 'ring-2 ring-primary/30 border-primary/40 bg-blue-50/40' : 'bg-white border-gray-100'
              )}
            >
              <Icon className="w-4 h-4 text-gray-400 mb-2" />
              <p className="text-2xl font-bold text-gray-900">{counts[s]}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
            </button>
          )
        })}
      </div>

      {/* Search + Filter tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search by title or category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition',
                    filterStatus === t.key
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-16 text-center text-gray-400">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading blogs…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No blogs found</p>
            <p className="text-sm mt-1">
              {search ? 'Try a different search term.' : 'Create your first blog post!'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Cover', 'Title & Excerpt', 'Category', 'SEO', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(blog => {
                  const sm = STATUS_META[blog.status]
                  return (
                    <tr key={blog.id} className="hover:bg-gray-50/50 group">
                      {/* Cover */}
                      <td className="px-4 py-3">
                        {blog.coverImage ? (
                          <img src={blog.coverImage} alt="" className="w-12 h-10 object-cover rounded-lg" />
                        ) : (
                          <div className="w-12 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-semibold text-gray-900 truncate">{blog.title}</p>
                        {blog.excerpt && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{blog.excerpt}</p>
                        )}
                        <p className="text-xs text-gray-300 mt-0.5 font-mono">/{blog.slug}</p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {blog.category ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-medium">{blog.category}</span>
                        ) : '—'}
                      </td>

                      {/* SEO quality */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <div className={clsx('w-1.5 h-1.5 rounded-full', blog.seo?.metaTitle ? 'bg-green-400' : 'bg-red-300')} />
                            <span className="text-xs text-gray-400">Meta title</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={clsx('w-1.5 h-1.5 rounded-full', blog.seo?.metaDescription ? 'bg-green-400' : 'bg-red-300')} />
                            <span className="text-xs text-gray-400">Meta desc</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={clsx('w-1.5 h-1.5 rounded-full', blog.coverImage ? 'bg-green-400' : 'bg-amber-300')} />
                            <span className="text-xs text-gray-400">Cover img</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <select
                          value={blog.status}
                          onChange={e => updateStatus(blog.id, e.target.value as ContentStatus)}
                          className={clsx(
                            'text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none cursor-pointer',
                            sm.color
                          )}
                        >
                          <option value="draft">Draft</option>
                          <option value="pending_approval">Send for Approval</option>
                          <option value="published">Published</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {(() => {
                          try {
                            const ts = blog.createdAt as any
                            const d = ts?.toDate ? ts.toDate() : new Date(ts)
                            return isNaN(d.getTime()) ? '—' : format(d, 'dd MMM yyyy')
                          } catch { return '—' }
                        })()}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          {blog.status === 'published' && (
                            <a
                              href={`https://upbeatheart.com/blogs/${blog.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                              title="View live"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                          <Link
                            to={`/blogs/${blog.id}/edit`}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-gray-400 hover:text-primary"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(blog.id, blog.title)}
                            disabled={deleting === blog.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-40"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && visible.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
            Showing {visible.length} of {blogs.length} blogs
          </div>
        )}
      </div>
    </div>
  )
}
