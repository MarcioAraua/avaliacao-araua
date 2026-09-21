'use strict';

// Configuração do Supabase (projeto da SEMED Arauá).
// A "anon/publishable key" abaixo é segura para ficar pública neste arquivo:
// ela só permite o que as políticas de Row Level Security do banco liberarem
// (ver supabase/schema.sql). Nunca coloque aqui a "service_role key".
const SUPABASE_URL = 'https://manpmdixzunqjojtkvys.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_awrNMD5CuzqFK6ZyUrK19A_kAZn71r6';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
