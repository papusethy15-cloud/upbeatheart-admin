export type UserRole = 'admin' | 'doctor'

export interface AppUser {
  uid: string
  email: string
  name: string
  role: UserRole
  photoURL?: string
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'unpaid' | 'paid'

export interface Appointment {
  id: string
  patientName: string
  patientPhone: string
  patientEmail: string
  preferredDate: string
  preferredTime: string
  reason: string
  reports: string[]
  status: AppointmentStatus
  paymentStatus: PaymentStatus
  razorpayOrderId?: string
  createdAt: string
}

export type ContentStatus = 'draft' | 'pending_approval' | 'published' | 'archived'

export interface Blog {
  id: string
  title: string
  slug?: string
  content: string
  excerpt: string
  coverImage: string
  category: string
  tags: string[]
  status: ContentStatus
  createdBy: string
  approvedBy?: string
  publishedAt?: string
  seo: { metaTitle: string; metaDescription: string; canonical: string }
  createdAt: string
}

export type CampaignStatus = 'draft' | 'pending_approval' | 'published' | 'active' | 'paused' | 'completed' | 'closed'

export interface Campaign {
  slug?: string
  id: string
  patientName: string
  patientStory: string
  diagnosis: string
  treatmentRequired: string
  estimatedCost: number
  amountRaised: number
  photos: string[]
  videos: string[]
  medicalDocs: string[]
  consentSigned: boolean
  hospital: string
  status: CampaignStatus
  doctorVerified: boolean
  approvedBy?: string
  createdAt: string
  updatedAt: string
  category: string
  tags: string[]
  updates: { text: string; date: string }[]
}

export interface MeetingRequest {
  id?: string
  date: string
  notes: string
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled'
}

export interface NGODocument {
  url: string
  publicId: string
  name: string
  type: 'image' | 'document'   // image = logo/photo, document = pdf/doc proof
  bytes: number
  label?: string               // e.g. "Registration Certificate", "Logo"
  uploadedAt: string
}

export interface NGO {
  id: string
  name: string
  contactPerson: string
  email: string
  phone: string
  address: string
  description: string
  website?: string
  status: 'pending' | 'approved' | 'active' | 'inactive'
  logoUrl?: string             // primary logo / profile image
  photos?: string[]            // gallery photos of the NGO
  documents?: NGODocument[]    // proof docs: reg cert, MoU, etc.
  meetingRequests?: MeetingRequest[]
  createdAt: string
}

export type PaymentMethod = 'razorpay' | 'cash' | 'upi' | 'cheque' | 'bank_transfer' | 'ngo_sponsorship' | 'hospital'
export type DonationSource = 'online' | 'manual'

export interface Donation {
  id: string
  campaignId: string
  campaignName: string
  donorName: string
  donorEmail?: string
  donorPhone?: string
  amount: number
  paymentMethod: PaymentMethod
  source: DonationSource           // 'online' = Razorpay, 'manual' = admin-entered
  razorpayPaymentId?: string
  razorpayOrderId?: string
  upiTransactionId?: string        // for UPI manual entry
  chequeNumber?: string            // for cheque
  receiptNumber?: string           // admin-assigned receipt
  notes?: string                   // admin notes
  collectedBy?: string             // admin name who recorded it
  status: 'created' | 'paid' | 'failed'
  anonymous: boolean
  showOnWebsite: boolean        // admin approval — show on donor wall
  showAmountPublic?: boolean    // show donation amount on donor wall
  createdAt: string
}

export interface Review {
  id: string
  patientName: string
  rating: number
  text: string
  photoURL?: string        // patient photo — Cloudinary URL
  videoURL?: string        // testimonial video — Cloudinary URL
  source: 'manual' | 'google'
  status: 'pending' | 'published' | 'archived'
  createdAt: string
}

export type GalleryCategory = 'clinic' | 'health_camp' | 'community' | 'awards'

export interface GalleryItem {
  id: string
  type: 'photo' | 'video'
  url: string
  thumbnailUrl?: string     // Cloudinary auto-generated video thumbnail
  caption: string
  category: GalleryCategory
  status: 'draft' | 'published'
  createdAt?: string
  fileSize?: number         // bytes
  width?: number
  height?: number
  duration?: number         // seconds (video)
}
