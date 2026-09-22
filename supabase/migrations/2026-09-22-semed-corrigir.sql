-- Libera o perfil "Coordenador SEMED" para corrigir provas (a ação
-- "Corrigir" em Provas aplicadas), igual já valia para diretor/coordenador
-- escolar/professor. "Folha" não grava nada no banco, então não precisa
-- de ajuste aqui — só a tela (já corrigida no app.js).
--
-- Seguro para rodar a qualquer momento: só recria políticas, não apaga
-- nem altera nenhum dado existente.

drop policy if exists resultados_insert on public.resultados;
create policy resultados_insert on public.resultados for insert to authenticated
  with check (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and (eh_global() or exists (
    select 1 from public.aplicacoes ap where ap.id = aplicacao and escola_da_turma(ap.turma) = minha_escola()
  )));

drop policy if exists resultados_update on public.resultados;
create policy resultados_update on public.resultados for update to authenticated
  using (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and (eh_global() or exists (
    select 1 from public.aplicacoes ap where ap.id = aplicacao and escola_da_turma(ap.turma) = minha_escola()
  )));

drop policy if exists resultados_delete on public.resultados;
create policy resultados_delete on public.resultados for delete to authenticated
  using (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and (eh_global() or exists (
    select 1 from public.aplicacoes ap where ap.id = aplicacao and escola_da_turma(ap.turma) = minha_escola()
  )));
