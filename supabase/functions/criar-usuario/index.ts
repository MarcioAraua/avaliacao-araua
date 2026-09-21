// Edge Function: cria um novo usuário (login) do sistema.
//
// Precisa rodar com privilégio elevado (service_role) porque criar uma conta
// de login para OUTRA pessoa (admin/SEMED cadastrando um diretor, por
// exemplo) não é algo que um cliente comum, mesmo autenticado como
// administrador, consegue fazer sozinho no Supabase Auth.
//
// Quem pode chamar: admin, semed, diretor ou coordenador (mesmas regras de
// perfisCriaveis() em app.js e perfil_criavel() em schema.sql).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function senhaTemporaria() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (n) => alfabeto[n % alfabeto.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const comoChamador = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await comoChamador.auth.getUser();
    if (!user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: chamador } = await admin.from("usuarios").select("*").eq("auth_id", user.id).single();
    if (!chamador || !["admin", "semed", "diretor", "coordenador"].includes(chamador.perfil))
      return json({ error: "Sem permissão." }, 403);

    const body = await req.json();
    const nome = String(body.nome || "").trim();
    const login = String(body.login || "").trim().toLowerCase();
    const email = body.email ? String(body.email).trim() : null;
    const perfil = String(body.perfil || "");
    const disciplina = body.disciplina ? String(body.disciplina).trim() : null;
    let escola = body.escola || null;

    if (!nome || !login || !perfil) return json({ error: "Preencha nome, login e perfil." }, 400);

    const criaveis = chamador.perfil === "admin"
      ? ["admin", "semed", "diretor", "coordenador", "professor"]
      : chamador.perfil === "semed"
      ? ["diretor", "coordenador", "professor"]
      : ["professor"];
    if (!criaveis.includes(perfil)) return json({ error: "Você não tem permissão para cadastrar este perfil." }, 403);

    const chamadorGlobal = ["admin", "semed"].includes(chamador.perfil);
    if (["admin", "semed"].includes(perfil)) escola = null;
    else if (!chamadorGlobal) escola = chamador.escola; // diretor/coordenador só cadastram na própria escola
    if (!["admin", "semed"].includes(perfil) && !escola)
      return json({ error: "Selecione a escola do usuário." }, 400);

    const { data: existente } = await admin.from("usuarios").select("id").ilike("login", login).maybeSingle();
    if (existente) return json({ error: "Já existe um usuário com este login." }, 400);

    const senha = senhaTemporaria();
    const authEmail = `${login}@avaliacao-araua.local`;
    const { data: novoAuth, error: erroAuth } = await admin.auth.admin.createUser({
      email: authEmail,
      password: senha,
      email_confirm: true,
    });
    if (erroAuth) return json({ error: erroAuth.message }, 400);

    const { data: novoUsuario, error: erroUsuario } = await admin
      .from("usuarios")
      .insert({
        auth_id: novoAuth.user.id, nome, login, email, perfil, disciplina, escola,
        trocar_senha: true, criado_por: chamador.id,
      })
      .select()
      .single();
    if (erroUsuario) {
      await admin.auth.admin.deleteUser(novoAuth.user.id); // desfaz o login criado, já que o cadastro falhou
      return json({ error: erroUsuario.message }, 400);
    }

    return json({ usuario: novoUsuario, senhaTemporaria: senha });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
