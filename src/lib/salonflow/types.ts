export interface SaleItem {
  kind: "service" | "product";
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface SalonSettings {
  salonName: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  email: string;
  currencySymbol: string;
  openMin: number;
  closeMin: number;
  slotStepMin: number;
  closedDays: string;
  heroImage: string;
  gallery: { url: string; caption: string }[];
}

export interface PublicService {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  durationMin: number;
  imageUrl: string;
}

export interface PublicStaff {
  id: string;
  name: string;
  title: string;
  bio: string;
  imageUrl: string;
  serviceIds: string[];
}

export interface Slot {
  min: number;
  label: string;
  available: boolean;
}
