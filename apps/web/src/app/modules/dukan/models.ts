export interface Address {
  id: string;
  label: string;
  receiver: string;
  mobile: string;
  line: string;
  city: string;
  state: string;
  pin: string;
  isDefault?: boolean;
  lat?: number;
  lng?: number;
}

export interface Buyer {
  id: string;
  name: string;
  phone: string;
  pin?: string;
  email?: string;
  gstin?: string;
  addresses?: Address[];
}

export interface Review {
  stars: number;
  text: string;
  date: string;
  buyer: string;
  reply?: string;
  replyDate?: string;
}

export interface Seller {
  name: string;
  upi: string;
  acc: string;
  ifsc: string;
  bank: string;
  city: string;
  gst: string;
  rating: number;
  mobile?: string;
  email?: string;
  address?: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  lat?: number;
  lng?: number;
}

export interface Category {
  id: string;
  name: string;
  mrp: number;
  disc: number;
  rate: number;
  status: 'active' | 'inactive';
  desc: string;
  parentId?: string | null;   // null = top-level; set = sub-category under parentId
}

export interface Product {
  id: string;
  catId: string;
  name: string;
  code: string;
  mrp: number;
  rate: number;
  stock: number;
  combo?: boolean;
  img?: string | null;
  gst?: number;
  gstInc?: boolean;
}

export interface CartLine { id: string; qty: number; }

export interface Order {
  id: string;
  billNo: string;
  date: string;
  items: { name: string; qty: number; rate: number }[];
  subtotal: number;
  delivery: number;
  gst: number;
  total: number;
  receiver: string;
  address: string;
  status: 'PAID';
}
