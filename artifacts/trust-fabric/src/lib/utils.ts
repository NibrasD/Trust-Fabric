import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUsdc(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount).replace('$', '') + ' USDC';
}

export function truncateHash(hash: string) {
  if (!hash) return '';
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function getReputationColor(score: number) {
  if (score >= 90) return 'text-green-500';
  if (score >= 70) return 'text-green-400';
  if (score >= 50) return 'text-yellow-500';
  if (score >= 30) return 'text-orange-500';
  return 'text-red-500';
}

export function getReputationBgColor(score: number) {
  if (score >= 90) return 'bg-green-500/20 text-green-500';
  if (score >= 70) return 'bg-green-400/20 text-green-400';
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-500';
  if (score >= 30) return 'bg-orange-500/20 text-orange-500';
  return 'bg-red-500/20 text-red-500';
}
