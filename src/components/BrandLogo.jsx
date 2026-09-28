// The Yoyo Gyms logo, on the gym's admin screens (CLAUDE.md §37.1 Q7). What a
// gym's MEMBERS see carries the gym's own icon instead: see GymIcon.
import { LOGO_ON_DARK } from '../../shared/brand.js';

export default function BrandLogo({ className = 'h-12 w-auto', alt = 'Yoyo Gyms' }) {
  return <img src={LOGO_ON_DARK} alt={alt} className={`object-contain ${className}`} />;
}
