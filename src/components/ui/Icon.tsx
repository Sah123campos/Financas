// Mapa explícito de ícones (evita incluir todo o pacote de ícones no bundle).
import {
  Baby, Briefcase, Building2, Car, Coffee, Dog, Droplets, Dumbbell, Filter, Fuel, Gift, GraduationCap, HeartPulse, Home, Landmark, Laptop,
  Package, PartyPopper, PiggyBank, Plane, Receipt, Repeat, Shirt, ShoppingBag, ShoppingCart, Smartphone, Tag, TrendingUp, UtensilsCrossed,
  Wallet, Wifi, Wrench, Zap, type LucideIcon, type LucideProps,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  Baby, Briefcase, Building2, Car, Coffee, Dog, Droplets, Dumbbell, Filter, Fuel, Gift, GraduationCap, HeartPulse, Home, Landmark, Laptop,
  Package, PartyPopper, PiggyBank, Plane, Receipt, Repeat, Shirt, ShoppingBag, ShoppingCart, Smartphone, Tag, TrendingUp, UtensilsCrossed,
  Wallet, Wifi, Wrench, Zap,
};

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Tag;
  return <C aria-hidden="true" {...props} />;
}
