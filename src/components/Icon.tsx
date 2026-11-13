export type IconName = 'home' | 'box' | 'sale' | 'wallet' | 'truck' | 'chart' | 'logout' | 'plus' | 'users' | 'bookmark';

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  sale: 'M6 6h15l-1.5 9H8L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l12-3v3M16 14h3',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  logout: 'M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9',
  plus: 'M12 5v14M5 12h14',
  users: 'M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM20 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  bookmark: 'M6 3h12v18l-6-4-6 4V3z',
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
