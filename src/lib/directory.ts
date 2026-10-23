import data from '../../data/isps.json';
import packages from '../../data/isp-packages.json';
import districts from '../../data/districts.json';
export type Provider = { name: string; slug: string; aliases: string[]; website?: string | null; asn?: number | null; source?: string; sources?: string[]; districts: string[]; nationwide?: boolean; licence: string; addresses?: string[]; notes?: string[]; possiblyLapsed?: boolean };
export const PROVIDERS = data as Provider[];
export const DISTRICTS = districts;
export const PACKAGES = packages as Record<string, { source: string; packages: { name: string | null; mbps: number; bdt: number; source?: string; vat?: string }[] }>;
export const serves = (i: Provider, district: string) => i.districts.includes(district) || !!i.nationwide;
