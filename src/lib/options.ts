// Shared between client form, API validation and pages.

export const CONNECTIONS = {
  cable: 'Cable (LAN)',
  wifi5: 'Wi-Fi 5 GHz',
  wifi24: 'Wi-Fi 2.4 GHz',
  wifi: "Wi-Fi (don't know band)",
} as const;

export const PLANS = {
  'lt10': 'Up to 10 Mbps',
  '10-20': '10–20 Mbps',
  '20-40': '20–40 Mbps',
  '40-60': '40–60 Mbps',
  '60-100': '60–100 Mbps',
  '100-200': '100–200 Mbps',
  '200+': '200+ Mbps',
} as const;

const AREA_NAMES = [
  'Adabor', 'Aftabnagar', 'Agargaon', 'Ashkona', 'Azimpur', 'Badda', 'Banani', 'Banasree', 'Bangshal',
  'Baridhara', 'Baridhara DOHS', 'Bashabo', 'Bashundhara R/A', 'Beraid', 'Cantonment', 'Chawkbazar',
  'Dakshinkhan', 'Demra', 'Dhanmondi', 'Elephant Road', 'Eskaton', 'Farmgate', 'Gendaria', 'Gulshan 1',
  'Gulshan 2', 'Hatirpool', 'Hazaribagh', 'Jatrabari', 'Jigatola', 'Kafrul', 'Kakrail', 'Kalabagan',
  'Kamrangirchar', 'Kawran Bazar', 'Kazipara', 'Keraniganj', 'Khilgaon', 'Khilkhet', 'Kuril', 'Lalbagh',
  'Lalmatia', 'Malibagh', 'Merul Badda', 'Mirpur 1', 'Mirpur 2', 'Mirpur 6', 'Mirpur 10', 'Mirpur 11',
  'Mirpur 12', 'Mirpur 13', 'Mirpur 14', 'Mirpur DOHS', 'Mogbazar', 'Mohakhali', 'Mohakhali DOHS',
  'Mohammadpur', 'Motijheel', 'Mugda', 'Niketan', 'Nikunja', 'Paltan', 'Pallabi', 'Puran Dhaka',
  'Rampura', 'Rayerbazar', 'Sabujbagh', 'Savar', 'Segunbagicha', 'Shahbagh', 'Shantinagar', 'Shewrapara',
  'Shyamoli', 'Siddheswari', 'Sutrapur', 'Tejgaon', 'Tongi', 'Turag', 'Uttarkhan', 'Vatara', 'Wari',
  ...Array.from({ length: 18 }, (_, i) => `Uttara Sector ${i + 1}`),
];

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const AREAS: Record<string, string> = Object.fromEntries(
  AREA_NAMES.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((n) => [slugify(n), n]),
);
