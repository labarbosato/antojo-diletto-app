import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key && url.startsWith('https://') && !url.includes('PEGA_AQUI') && !key.includes('PEGA_AQUI'));

export const supabase = createClient(isConfigured ? (url as string) : 'https://no-configurado.invalid', isConfigured ? (key as string) : 'no-configurado');
