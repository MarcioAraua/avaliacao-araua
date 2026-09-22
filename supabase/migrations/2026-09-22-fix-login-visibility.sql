-- Correção crítica: nenhum professor conseguia fazer login.
--
-- A política de SELECT em "usuarios" exigia ser "gerente" (admin/semed/
-- diretor/coordenador) até para ver a própria linha. Como o app busca o
-- cadastro do usuário logo após autenticar (pra saber perfil/escola), um
-- professor sempre recebia "nenhuma linha encontrada" e era deslogado com
-- a mensagem "Usuário sem cadastro no sistema" — mesmo com login/senha
-- corretos. Corrigido para qualquer usuário sempre poder ver a própria
-- linha, além dos gerentes verem as demais da própria escola.
--
-- Na mesma linha, professores também não conseguiam ver a própria escola
-- (nome aparecia em branco/"?" em várias telas) pelo mesmo motivo.
--
-- Reforço adicional: ao salvar um resultado, agora o banco confere que o
-- aluno informado realmente pertence à turma da prova aplicada (antes só
-- conferia a escola da prova, não a correspondência aluno<->turma).
--
-- Seguro para rodar a qualquer momento: só recria políticas, não apaga
-- nem altera nenhum dado existente.

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
  using (auth_id = auth.uid() or (eh_gerente() and (eh_global() or escola = minha_escola())));

drop policy if exists escolas_select on public.escolas;
create policy escolas_select on public.escolas for select to authenticated
  using (eh_gerente() or id = minha_escola());

drop policy if exists resultados_insert on public.resultados;
create policy resultados_insert on public.resultados for insert to authenticated
  with check (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and exists (
    select 1 from public.aplicacoes ap join public.alunos al on al.turma = ap.turma
    where ap.id = aplicacao and al.id = aluno and (eh_global() or escola_da_turma(ap.turma) = minha_escola())
  ));

drop policy if exists resultados_update on public.resultados;
create policy resultados_update on public.resultados for update to authenticated
  using (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and exists (
    select 1 from public.aplicacoes ap join public.alunos al on al.turma = ap.turma
    where ap.id = aplicacao and al.id = aluno and (eh_global() or escola_da_turma(ap.turma) = minha_escola())
  ));
