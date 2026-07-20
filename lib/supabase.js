import { createClient } from '@supabase/supabase-js';
//getting base database info
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
//checking if  url and client key exists
if (!url) throw new Error('SUPABASE_URL is not set');
if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is not set');

//creating database connection
export const db = createClient(url, serviceKey, {
  //user login session are not saved due to backend servise work
  auth: { persistSession: false, autoRefreshToken: false },
  //getting only refreshed data
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});