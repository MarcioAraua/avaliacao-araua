-- Correção de segurança: impede que um diretor/coordenador escale o próprio
-- perfil (ou o de outro usuário da escola) para admin/semed via chamada
-- direta à API, e corrige o travamento de professores na troca de senha
-- obrigatória do primeiro acesso.
--
-- Seguro para rodar a qualquer momento: só recria políticas e adiciona uma
-- função nova, não apaga nem altera nenhum dado existente.

drop policy if exists usuarios_insert on public.usuarios;

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update to authenticated
  using (eh_gerente() and (eh_global() or escola = minha_escola()))
  with check (
    eh_gerente()
    and perfil_criavel(perfil)
    and (eh_global() or escola = minha_escola())
    and (auth_id <> auth.uid() or perfil = meu_perfil())
  );

create or replace function public.concluir_troca_senha() returns void
language sql security definer set search_path = public as $$
  update usuarios set trocar_senha = false where auth_id = auth.uid()
$$;
grant execute on function public.concluir_troca_senha() to authenticated;
