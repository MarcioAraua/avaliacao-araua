'use strict';

/* ---------- Senhas ---------- */
const CHAVE_SESSAO = 'gabarito.sessao';
const codificar = new TextEncoder();

async function derivar(senha, sal) {
  if (!window.crypto?.subtle) { // ambiente sem WebCrypto: hash simples (menos seguro)
    let h = 5381;
    for (const c of sal + senha) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    return 'x' + h;
  }
  const chave = await crypto.subtle.importKey('raw', codificar.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: codificar.encode(sal), iterations: 100000, hash: 'SHA-256' }, chave, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function criarSenha(senha) {
  const sal = novoId() + novoId();
  return { sal, hash: await derivar(senha, sal) };
}
async function senhaConfere(u, senha) { return (await derivar(senha, u.sal)) === u.hash; }
function senhaTemporaria() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(8))].map(n => alfabeto[n % alfabeto.length]).join('');
}

/* ---------- Dados iniciais e migração ---------- */
function gerarLogin(nome, email) {
  const base = ((email || '').split('@')[0] || nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '.').replace(/^\.|\.$/g, '') || 'usuario';
  let login = base, n = 1;
  while (db.usuarios.some(u => u.login === login)) login = base + (++n);
  return login;
}
async function prepararDados() {
  let mudou = false;
  // professores cadastrados na versão anterior viram usuários (a senha deve ser redefinida por um gestor)
  for (const p of db.professores) {
    db.usuarios.push({ id: p.id, nome: p.nome, login: gerarLogin(p.nome, p.email), email: p.email || '', perfil: 'professor',
      disciplina: p.disciplina || '', escola: p.escola, ...(await criarSenha(senhaTemporaria())), trocar: true });
    mudou = true;
  }
  db.professores = [];
  // provas da versão anterior traziam turma/professor/data no próprio registro: viram um item do banco de provas
  // (sem turma) + uma "prova aplicada" vinculando essa prova à turma; os resultados passam a apontar para a aplicação.
  for (const p of db.provas.filter(p => p.turma)) {
    const ap = { id: novoId(), prova: p.id, turma: p.turma, data: p.data || '', professor: p.professor || '' };
    db.aplicacoes.push(ap);
    db.resultados.forEach(r => { if (r.prova === p.id) { r.aplicacao = ap.id; delete r.prova; } });
    delete p.turma; delete p.professor; delete p.data;
    mudou = true;
  }
  if (!db.usuarios.some(u => u.perfil === 'admin')) {
    db.usuarios.push({ id: novoId(), nome: 'Administrador', login: 'admin', email: '', perfil: 'admin', escola: '', ...(await criarSenha('admin123')), trocar: true });
    mudou = true;
  }
  if (mudou) salvar();
}

async function iniciar() {
  await prepararDados();
  const u = porId('usuarios', sessionStorage.getItem(CHAVE_SESSAO));
  if (u && !u.trocar) entrar(u); else telaLogin('entrar');
}

/* ---------- Tela de login ---------- */
const LOGO = `<svg class="logo" viewBox="0 0 72 72" fill="none" aria-hidden="true">
  <rect width="72" height="72" rx="18" fill="rgba(255,255,255,.18)"/>
  <rect x="18" y="12" width="36" height="48" rx="5" fill="#fff"/>
  <circle cx="26" cy="24" r="3.4" fill="#e8590c"/><rect x="33" y="22" width="14" height="4" rx="2" fill="#f5d9c2"/>
  <circle cx="26" cy="35" r="3.4" fill="#e8590c"/><rect x="33" y="33" width="14" height="4" rx="2" fill="#f5d9c2"/>
  <circle cx="26" cy="46" r="3.4" stroke="#e8590c" stroke-width="1.6"/><rect x="33" y="44" width="14" height="4" rx="2" fill="#f5d9c2"/>
  <path d="M40 50l5 5 11-13" stroke="#f59f00" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let falhas = 0, bloqueadoAte = 0;

function telaLogin(modo = 'entrar', uid = null) {
  document.body.classList.add('deslogado');
  sessao = null;
  const el = document.getElementById('login');
  const lado = `<div class="login-lado">${LOGO}
    <h1>Secretaria Municipal de Educação de Arauá</h1><div class="linha"></div>
    <p>Sistema de Gestão de Avaliações</p></div>`;
  const admin = db.usuarios.find(u => u.login === 'admin');
  const campoSenha = (nome, rotulo, auto) => `<label>${rotulo}</label><div class="campo-senha"><input name="${nome}" type="password" autocomplete="${auto}" required>
    <button type="button" data-ver>mostrar</button></div>`;
  let caixa;
  if (modo === 'entrar') caixa = `<form class="login-form" id="lf">
      <h2>Bem-vindo(a)</h2><p class="dica">Acesse com seu usuário e senha.</p>
      <label>Usuário</label><input name="login" autocomplete="username" autofocus required>
      ${campoSenha('senha', 'Senha', 'current-password')}
      <button class="entrar" type="submit">Entrar</button>
      <button class="link" type="button" id="esqueci">Esqueceu a senha?</button>
      <div id="msg"></div>
      ${admin?.trocar ? '<div class="primeiro"><b>Primeiro acesso:</b> usuário <b>admin</b> e senha <b>admin123</b>. A troca da senha será exigida.</div>' : ''}
    </form>`;
  else if (modo === 'esqueci') caixa = `<form class="login-form" id="lf">
      <h2>Recuperar acesso</h2><p class="dica">Informe seu usuário ou e-mail. A solicitação será enviada ao administrador ou ao responsável pelo seu cadastro, que informará uma senha temporária.</p>
      <label>Usuário ou e-mail</label><input name="id" autofocus required>
      <button class="entrar" type="submit">Solicitar redefinição</button>
      <button class="link" type="button" id="voltar">Voltar ao login</button>
      <div id="msg"></div></form>`;
  else caixa = `<form class="login-form" id="lf">
      <h2>Crie uma nova senha</h2><p class="dica">Por segurança, defina uma senha pessoal para continuar (mínimo de 6 caracteres).</p>
      ${campoSenha('nova', 'Nova senha', 'new-password')}
      ${campoSenha('conf', 'Confirmar nova senha', 'new-password')}
      <button class="entrar" type="submit">Salvar e entrar</button>
      <button class="link" type="button" id="voltar">Cancelar</button>
      <div id="msg"></div></form>`;
  el.innerHTML = lado + `<div class="login-caixa"><img class="logo-oficial" src="logo-semed.png" alt="Prefeitura de Arauá – Secretaria Municipal de Educação">${caixa}</div>`;

  const f = el.querySelector('#lf'), msg = el.querySelector('#msg'), btn = f.querySelector('.entrar');
  const aviso = (t, ok) => { msg.className = ok ? 'ok' : 'erro'; msg.textContent = t; };
  f.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
    const i = b.previousElementSibling, ver = i.type === 'password';
    i.type = ver ? 'text' : 'password'; b.textContent = ver ? 'ocultar' : 'mostrar';
  });
  el.querySelector('#esqueci')?.addEventListener('click', () => telaLogin('esqueci'));
  el.querySelector('#voltar')?.addEventListener('click', () => telaLogin('entrar'));

  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    try {
      if (modo === 'entrar') {
        if (Date.now() < bloqueadoAte) return aviso(`Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} s.`);
        const u = db.usuarios.find(x => x.login.toLowerCase() === d.login.trim().toLowerCase());
        if (!u || !(await senhaConfere(u, d.senha))) {
          if (++falhas >= 5) { bloqueadoAte = Date.now() + 30000; falhas = 0; }
          return aviso('Usuário ou senha inválidos.');
        }
        falhas = 0;
        if (u.trocar) return telaLogin('trocar', u.id);
        entrar(u);
      } else if (modo === 'esqueci') {
        const chave = d.id.trim().toLowerCase();
        const u = db.usuarios.find(x => x.login.toLowerCase() === chave || (x.email && x.email.toLowerCase() === chave));
        if (u && !db.solicitacoes.some(s => s.usuario === u.id && !s.atendida))
          { db.solicitacoes.push({ id: novoId(), usuario: u.id, data: new Date().toISOString(), atendida: false }); salvar(); }
        aviso('Solicitação registrada. Procure o administrador ou o responsável pelo seu cadastro para receber a senha temporária.', true);
      } else {
        if (d.nova.length < 6) return aviso('A senha deve ter pelo menos 6 caracteres.');
        if (d.nova !== d.conf) return aviso('As senhas não conferem.');
        if (d.nova === 'admin123') return aviso('Escolha uma senha diferente da senha padrão.');
        const u = porId('usuarios', uid);
        Object.assign(u, await criarSenha(d.nova), { trocar: false });
        salvar(); entrar(u);
      }
    } finally { btn.disabled = false; }
  };
}

/* ---------- Sessão ---------- */
function entrar(u) {
  sessao = u;
  sessionStorage.setItem(CHAVE_SESSAO, u.id);
  document.body.classList.remove('deslogado');
  document.getElementById('usuario').innerHTML = `<div><b>${esc(u.nome)}</b><span>${PERFIS[u.perfil]}${u.escola ? ' · ' + esc(porId('escolas', u.escola)?.nome ?? '') : ''}</span></div>
    <button onclick="alterarSenha()">Alterar senha</button><button onclick="sair()">Sair</button>`;
  aba = abasVisiveis().includes('turmas') ? 'turmas' : abasVisiveis()[0];
  menu(); listar();
}
function sair() {
  sessionStorage.removeItem(CHAVE_SESSAO);
  document.getElementById('conteudo').innerHTML = '';
  telaLogin('entrar');
}

function alterarSenha() {
  form.innerHTML = `<h3>Alterar minha senha</h3>
    <label>Senha atual</label><input type="password" name="atual" autocomplete="current-password">
    <label>Nova senha (mínimo 6 caracteres)</label><input type="password" name="nova" autocomplete="new-password">
    <label>Confirmar nova senha</label><input type="password" name="conf" autocomplete="new-password">
    <div class="msg erro" id="msgsenha"></div>
    <div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" type="submit">Salvar</button></div>`;
  form.onsubmit = async ev => {
    ev.preventDefault(); // mantém a janela aberta até validar
    const d = Object.fromEntries(new FormData(form)), erro = t => { form.querySelector('#msgsenha').textContent = t; };
    if (!(await senhaConfere(sessao, d.atual))) return erro('Senha atual incorreta.');
    if (d.nova.length < 6) return erro('A nova senha deve ter pelo menos 6 caracteres.');
    if (d.nova !== d.conf) return erro('As senhas não conferem.');
    Object.assign(sessao, await criarSenha(d.nova), { trocar: false });
    salvar(); dlg.close(); alert('Senha alterada com sucesso.');
  };
  dlg.showModal();
}
