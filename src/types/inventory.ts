export type StorageLocation = '냉장' | '냉동' | '실온'
export type ExpirySource   = 'user' | 'standard' | 'ocr'
export type AddedBy        = 'manual' | 'ocr' | 'image'

export interface InventoryItem {
  id: number
  user_id: string
  ingredient_name: string
  quantity: number | null
  unit: string | null
  purchase_date: string | null     // ISO date (YYYY-MM-DD)
  expiry_date: string | null
  expiry_source: ExpirySource
  storage_location: StorageLocation
  added_by: AddedBy
  is_consumed: boolean
  consumed_at: string | null
  created_at: string
  updated_at: string
}

export interface ExpiryStandard {
  id: number
  ingredient_name: string
  storage_location: StorageLocation
  days_from_purchase: number
  source: string | null
}

// POST /api/inventory body
export interface CreateInventoryItemBody {
  ingredient_name: string
  quantity?: number
  unit?: string
  purchase_date?: string
  expiry_date?: string
  expiry_source?: ExpirySource
  storage_location?: StorageLocation
  added_by?: AddedBy
}

// POST /api/inventory/bulk body
export interface BulkCreateBody {
  items: CreateInventoryItemBody[]
}
