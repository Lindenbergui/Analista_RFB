/* =============================================================
   Questões RFB — aplicativo de revisão por questões
   Dados das questões: arquivos JSON versionados no repositório.
   Progresso de estudo: localStorage do aparelho (nunca é sobrescrito
   quando novas questões chegam pelo GitHub).
   ============================================================= */
(function () {
  'use strict';

  var VERSAO_APP = '1.0.0';
  var K = {
    prog: 'rfb:progresso:v1',
    ajustes: 'rfb:ajustes:v1',
    diario: 'rfb:diario:v1',
    backup: 'rfb:ultimoBackup:v1'
  };
  var MIN = 60000;
  var DIA = 86400000;
  var LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

  var AJUSTES_PADRAO = {
    novasPorDia: 20,
    maxRevisoes: 120,
    tamanhoSimulado: 20,
    embaralhar: true,
    tema: 'auto'
  };

  var estado = {
    indice: null,
    materias: [],
    porId: new Map(),
    prog: {},
    diario: {},
    ajustes: Object.assign({}, AJUSTES_PADRAO),
    sessao: null,
    tela: 'hoje',
    filtro: { materia: '', topico: '', busca: '' }
  };

  /* ---------- utilidades ---------- */

  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'texto') n.textContent = v;
        else if (k === 'estilo') n.setAttribute('style', v);
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (filhos || []).forEach(function (f) {
      if (f === null || f === undefined || f === false) return;
      n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    });
    return n;
  }

  function paragrafos(texto, classe) {
    var caixa = el('div', { class: classe });
    String(texto || '').split(/\n{1,}/).forEach(function (linha) {
      if (linha.trim()) caixa.appendChild(el('p', { texto: linha.trim() }));
    });
    return caixa;
  }

  function ler(chave, padrao) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) { return padrao; }
  }

  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { aviso('Não foi possível salvar no aparelho. Libere espaço e exporte um backup.'); return false; }
  }

  var tempoAviso;
  function aviso(texto) {
    var cx = document.getElementById('aviso');
    cx.textContent = texto;
    cx.hidden = false;
    clearTimeout(tempoAviso);
    tempoAviso = setTimeout(function () { cx.hidden = true; }, 3200);
  }

  function embaralhar(lista) {
    var a = lista.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function diaChave(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var x = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + x;
  }

  function formatarIntervalo(dias) {
    if (dias < 1) return '10 min';
    if (dias < 30) return Math.round(dias) + ' d';
    if (dias < 365) return Math.round(dias / 30) + ' mes';
    return (dias / 365).toFixed(1).replace('.', ',') + ' a';
  }

  /* ---------- carga dos dados ---------- */

  function carregarLocal() {
    estado.prog = ler(K.prog, {});
    estado.diario = ler(K.diario, {});
    estado.ajustes = Object.assign({}, AJUSTES_PADRAO, ler(K.ajustes, {}));
    aplicarTema();
  }

  function aplicarTema() {
    var t = estado.ajustes.tema;
    if (t === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', t);
  }

  function salvarProgresso() { gravar(K.prog, estado.prog); }
  function salvarDiario() { gravar(K.diario, estado.diario); }
  function salvarAjustes() { gravar(K.ajustes, estado.ajustes); }

  async function carregarBanco(forcar) {
    var opcoes = forcar ? { cache: 'reload' } : {};
    var resposta = await fetch('./data/index.json', opcoes);
    if (!resposta.ok) throw new Error('index.json não encontrado');
    var indice = await resposta.json();
    estado.indice = indice;

    var materias = await Promise.all(indice.materias.map(async function (m) {
      var copia = Object.assign({}, m, { questoes: [] });
      try {
        var r = await fetch('./data/' + m.arquivo, opcoes);
        if (r.ok) {
          var conteudo = await r.json();
          copia.questoes = (conteudo.questoes || []).map(function (q) {
            q.materiaId = m.id;
            return q;
          });
        }
      } catch (e) { /* matéria ainda sem arquivo de questões */ }
      return copia;
    }));

    estado.materias = materias;
    estado.porId = new Map();
    materias.forEach(function (m) {
      m.mapaTopicos = {};
      (m.topicos || []).forEach(function (t) { m.mapaTopicos[t.codigo] = t.nome; });
      m.questoes.forEach(function (q) { estado.porId.set(q.id, q); });
    });
    return materias.reduce(function (s, m) { return s + m.questoes.length; }, 0);
  }

  function materiaDe(id) {
    return estado.materias.find(function (m) { return m.id === id; });
  }

  /* ---------- repetição espaçada ---------- */

  function novoProgresso() {
    return { ef: 2.5, intervalo: 0, due: 0, reps: 0, lapsos: 0, estado: 'novo',
             acertos: 0, erros: 0, ultimaCorreta: null, ultimaRev: 0, marcada: false };
  }

  function progressoDe(id) {
    if (!estado.prog[id]) estado.prog[id] = novoProgresso();
    return estado.prog[id];
  }

  function ehNova(q) {
    var p = estado.prog[q.id];
    return !p || p.reps === 0;
  }

  function ehVencida(q, agora) {
    var p = estado.prog[q.id];
    return !!p && p.reps > 0 && p.due <= agora;
  }

  // Calcula o próximo agendamento. Nota: 0 errou, 3 difícil, 4 bom, 5 fácil.
  function calcular(p, nota) {
    var ef = p.ef, intervalo = p.intervalo, fase = p.estado === 'novo' ? 'aprendendo' : p.estado;

    if (nota === 0) {
      ef = Math.max(1.3, ef - 0.2);
      intervalo = 0;
      fase = p.estado === 'revisao' ? 'reaprendendo' : 'aprendendo';
    } else if (p.estado === 'revisao') {
      if (nota === 3) { ef = Math.max(1.3, ef - 0.15); intervalo = Math.max(1, intervalo * 1.2); }
      else if (nota === 4) { intervalo = Math.max(1, intervalo * ef); }
      else { ef = Math.min(3.2, ef + 0.1); intervalo = Math.max(2, intervalo * ef * 1.3); }
      intervalo = Math.min(365, Math.round(intervalo));
      fase = 'revisao';
    } else {
      if (nota === 3) { intervalo = 0; fase = 'aprendendo'; }
      else if (nota === 4) { intervalo = 1; fase = 'revisao'; }
      else { intervalo = 3; fase = 'revisao'; }
    }
    return { ef: ef, intervalo: intervalo, estado: fase };
  }

  function aplicarNota(id, nota, acertou, mexerAgenda) {
    var p = progressoDe(id);
    var agora = Date.now();

    p.reps += 1;
    p.ultimaRev = agora;
    p.ultimaCorreta = acertou;
    if (acertou) p.acertos += 1; else p.erros += 1;

    if (mexerAgenda) {
      var novo = calcular(p, nota);
      if (nota === 0 && p.estado === 'revisao') p.lapsos += 1;
      p.ef = novo.ef;
      p.intervalo = novo.intervalo;
      p.estado = novo.estado;
      p.due = novo.intervalo < 1 ? agora + 10 * MIN : agora + novo.intervalo * DIA;
    } else if (!p.due) {
      p.due = agora;
    }

    var d = estado.diario[diaChave()] || { novas: 0, revisoes: 0, respostas: 0, acertos: 0 };
    d.respostas += 1;
    if (acertou) d.acertos += 1;
    if (p.reps === 1) d.novas += 1; else d.revisoes += 1;
    estado.diario[diaChave()] = d;

    salvarProgresso();
    salvarDiario();
  }

  function previsao(id, nota) {
    var p = estado.prog[id] || novoProgresso();
    var novo = calcular(p, nota);
    return formatarIntervalo(novo.intervalo);
  }

  /* ---------- seleção de questões ---------- */

  function filtrar(materias, topicos) {
    var saida = [];
    estado.materias.forEach(function (m) {
      if (materias && materias.length && materias.indexOf(m.id) === -1) return;
      m.questoes.forEach(function (q) {
        if (topicos && topicos.length && topicos.indexOf(q.topico) === -1) return;
        saida.push(q);
      });
    });
    return saida;
  }

  function misturar(revisoes, novas) {
    if (!novas.length) return revisoes;
    if (!revisoes.length) return novas;
    var fila = revisoes.slice();
    var passo = Math.max(1, Math.floor(fila.length / novas.length));
    novas.forEach(function (q, i) {
      var pos = Math.min(fila.length, (i + 1) * passo + i);
      fila.splice(pos, 0, q);
    });
    return fila;
  }

  function montarFila(op) {
    var pool = filtrar(op.materias, op.topicos);
    var agora = Date.now();

    if (op.modo === 'simulado') {
      return embaralhar(pool).slice(0, op.limite || estado.ajustes.tamanhoSimulado);
    }
    if (op.modo === 'erros') {
      return embaralhar(pool.filter(function (q) {
        var p = estado.prog[q.id];
        return p && p.ultimaCorreta === false;
      }));
    }
    if (op.modo === 'marcadas') {
      return pool.filter(function (q) { return estado.prog[q.id] && estado.prog[q.id].marcada; });
    }
    if (op.modo === 'novas') {
      return embaralhar(pool.filter(ehNova)).slice(0, op.limite || estado.ajustes.novasPorDia);
    }

    var vencidas = pool.filter(function (q) { return ehVencida(q, agora); })
      .sort(function (a, b) { return estado.prog[a.id].due - estado.prog[b.id].due; })
      .slice(0, estado.ajustes.maxRevisoes);

    var feitasHoje = (estado.diario[diaChave()] || {}).novas || 0;
    var cota = Math.max(0, estado.ajustes.novasPorDia - feitasHoje);
    var novas = embaralhar(pool.filter(ehNova)).slice(0, cota);

    return misturar(vencidas, novas);
  }

  function contagens(materiaId) {
    var agora = Date.now();
    var pool = materiaId ? filtrar([materiaId]) : filtrar();
    var c = { total: pool.length, novas: 0, vencidas: 0, consolidadas: 0, acertos: 0, erros: 0, marcadas: 0, erradas: 0 };
    pool.forEach(function (q) {
      var p = estado.prog[q.id];
      if (ehNova(q)) c.novas += 1;
      else if (p.due <= agora) c.vencidas += 1;
      if (p) {
        if (p.intervalo >= 21) c.consolidadas += 1;
        c.acertos += p.acertos;
        c.erros += p.erros;
        if (p.marcada) c.marcadas += 1;
        if (p.ultimaCorreta === false) c.erradas += 1;
      }
    });
    return c;
  }

  /* ---------- navegação ---------- */

  function irPara(tela) {
    if (estado.sessao) return;
    estado.tela = tela;
    document.querySelectorAll('.nav-item').forEach(function (b) {
      if (b.dataset.tela === tela) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    renderizar();
  }

  function renderizar() {
    var alvo = document.getElementById('tela');
    alvo.innerHTML = '';
    document.getElementById('barra-acoes').innerHTML = '';
    document.body.classList.toggle('estudando', !!estado.sessao);

    if (estado.sessao) return telaEstudo(alvo);
    if (estado.tela === 'hoje') return telaHoje(alvo);
    if (estado.tela === 'banco') return telaBanco(alvo);
    if (estado.tela === 'progresso') return telaProgresso(alvo);
    if (estado.tela === 'ajustes') return telaAjustes(alvo);
  }

  function titulo(texto) { document.getElementById('titulo').textContent = texto; }

  /* ---------- tela: hoje ---------- */

  function telaHoje(alvo) {
    titulo('Questões RFB');
    var geral = contagens();

    var resumo = el('div', { class: 'resumo' }, [
      el('div', { class: 'bloco' }, [
        el('b', { texto: String(geral.vencidas) }),
        el('span', { texto: 'para revisar' })
      ]),
      el('div', { class: 'bloco' }, [
        el('b', { texto: String(Math.min(geral.novas, Math.max(0, estado.ajustes.novasPorDia - ((estado.diario[diaChave()] || {}).novas || 0)))) }),
        el('span', { texto: 'novas hoje' })
      ]),
      el('div', { class: 'bloco' }, [
        el('b', { texto: String(geral.total) }),
        el('span', { texto: 'no banco' })
      ])
    ]);
    alvo.appendChild(resumo);

    if (geral.total === 0) {
      alvo.appendChild(el('div', { class: 'vazio' }, [
        el('b', { texto: 'O banco ainda está vazio' }),
        el('span', { texto: 'Adicione questões nos arquivos de data/ no GitHub e toque em Ajustes › Buscar novas questões.' })
      ]));
      return;
    }

    var fila = montarFila({ modo: 'srs' });
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn principal largo',
        texto: fila.length ? 'Revisar tudo (' + fila.length + ')' : 'Nada vencido — estudar novas',
        onclick: function () {
          iniciar({ modo: fila.length ? 'srs' : 'novas', titulo: 'Revisão geral' });
        }
      })
    ]));

    alvo.appendChild(el('h2', { texto: 'Por matéria' }));
    var lista = el('ul', { class: 'lista' });
    estado.materias.forEach(function (m) {
      var c = contagens(m.id);
      var pendente = c.vencidas + Math.min(c.novas, estado.ajustes.novasPorDia);
      var botao = el('button', { class: 'materia', estilo: '--rule:' + m.cor }, [
        el('span', { class: 'nome' }, [
          document.createTextNode(m.nome),
          el('span', { class: 'meta', texto: c.total + ' questões · ' + c.novas + ' novas · ' + c.consolidadas + ' consolidadas' })
        ]),
        el('span', { class: 'contador ' + (c.vencidas ? 'due' : 'zero'), texto: String(c.vencidas) })
      ]);
      botao.addEventListener('click', function () {
        if (!c.total) { aviso('Ainda não há questões nesta matéria.'); return; }
        abrirMateria(m);
      });
      lista.appendChild(botao);
    });
    alvo.appendChild(lista);

    var extras = el('div', { class: 'acoes' });
    extras.appendChild(el('button', {
      class: 'btn', texto: 'Simulado de ' + estado.ajustes.tamanhoSimulado,
      onclick: function () { iniciar({ modo: 'simulado', titulo: 'Simulado', agenda: false }); }
    }));
    if (geral.erradas) {
      extras.appendChild(el('button', {
        class: 'btn', texto: 'Revisar erros (' + geral.erradas + ')',
        onclick: function () { iniciar({ modo: 'erros', titulo: 'Erros' }); }
      }));
    }
    if (geral.marcadas) {
      extras.appendChild(el('button', {
        class: 'btn', texto: 'Marcadas (' + geral.marcadas + ')',
        onclick: function () { iniciar({ modo: 'marcadas', titulo: 'Marcadas' }); }
      }));
    }
    alvo.appendChild(extras);
  }

  function abrirMateria(m) {
    var alvo = document.getElementById('tela');
    alvo.innerHTML = '';
    titulo(m.curto || m.nome);
    document.getElementById('barra-acoes').appendChild(
      el('button', { class: 'btn pequeno fantasma', texto: '‹ Voltar', onclick: function () { irPara('hoje'); } })
    );

    var c = contagens(m.id);
    alvo.appendChild(el('p', { class: 'sub', texto: c.total + ' questões · ' + c.vencidas + ' vencidas · ' + c.novas + ' novas' }));
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn principal largo', texto: 'Revisar esta matéria',
        onclick: function () { iniciar({ modo: 'srs', materias: [m.id], titulo: m.curto || m.nome }); }
      })
    ]));
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn', texto: 'Só questões novas',
        onclick: function () { iniciar({ modo: 'novas', materias: [m.id], titulo: m.curto || m.nome }); }
      }),
      el('button', {
        class: 'btn', texto: 'Simulado da matéria',
        onclick: function () { iniciar({ modo: 'simulado', materias: [m.id], titulo: m.curto || m.nome, agenda: false }); }
      })
    ]));

    alvo.appendChild(el('h2', { texto: 'Tópicos do edital' }));
    var lista = el('ul', { class: 'lista' });
    (m.topicos || []).forEach(function (t) {
      var qs = m.questoes.filter(function (q) { return q.topico === t.codigo; });
      var agora = Date.now();
      var venc = qs.filter(function (q) { return ehVencida(q, agora); }).length;
      var linha = el('button', {
        class: 'materia', estilo: '--rule:' + (qs.length ? m.cor : 'var(--linha)'),
        onclick: function () {
          if (!qs.length) { aviso('Sem questões em ' + t.codigo + ' ainda.'); return; }
          iniciar({ modo: 'srs', materias: [m.id], topicos: [t.codigo], titulo: t.codigo, forcarTudo: true });
        }
      }, [
        el('span', { class: 'nome' }, [
          document.createTextNode(t.codigo + ' ' + t.nome),
          el('span', { class: 'meta', texto: qs.length ? qs.length + ' questões' : 'sem questões' })
        ]),
        el('span', { class: 'contador ' + (venc ? 'due' : 'zero'), texto: String(venc) })
      ]);
      lista.appendChild(linha);
    });
    alvo.appendChild(lista);
  }

  /* ---------- sessão de estudo ---------- */

  function iniciar(op) {
    var fila = montarFila({
      modo: op.modo,
      materias: op.materias || [],
      topicos: op.topicos || [],
      limite: op.limite
    });

    // Ao entrar por um tópico específico, se nada estiver vencido, estuda tudo do tópico.
    if (!fila.length && op.forcarTudo) {
      fila = embaralhar(filtrar(op.materias || [], op.topicos || []));
    }
    if (!fila.length) {
      aviso('Nada pendente por aqui. Tente um simulado ou outra matéria.');
      return;
    }

    estado.sessao = {
      fila: fila.map(function (q) { return q.id; }),
      pos: 0,
      respondidas: 0,
      acertos: 0,
      modo: op.modo,
      agenda: op.agenda !== false,
      titulo: op.titulo || 'Estudo',
      escolha: null,
      revelado: false,
      ordem: null
    };
    renderizar();
  }

  function encerrar() {
    estado.sessao = null;
    renderizar();
  }

  function telaEstudo(alvo) {
    var s = estado.sessao;
    titulo(s.titulo);
    document.getElementById('barra-acoes').appendChild(
      el('button', { class: 'btn pequeno fantasma', texto: 'Encerrar', onclick: encerrar })
    );

    if (s.pos >= s.fila.length) return telaFim(alvo);

    var q = estado.porId.get(s.fila[s.pos]);
    if (!q) { s.pos += 1; return telaEstudo(alvo); }

    var m = materiaDe(q.materiaId) || {};
    var p = estado.prog[q.id];

    alvo.appendChild(el('div', { class: 'trilho' }, [
      el('i', { estilo: 'width:' + Math.round((s.pos / s.fila.length) * 100) + '%' })
    ]));

    var rotulo = el('div', { class: 'rotulo-questao', estilo: '--rule:' + (m.cor || 'var(--acento)') }, [
      el('span', { class: 'pino', texto: m.curto || m.nome || q.materiaId }),
      el('span', { texto: q.topico + (m.mapaTopicos && m.mapaTopicos[q.topico] ? ' ' + m.mapaTopicos[q.topico] : '') }),
      el('span', { texto: (s.pos + 1) + '/' + s.fila.length }),
      ehNova(q) ? el('span', { class: 'selo nova', texto: 'nova' }) : null,
      p && p.marcada ? el('span', { class: 'selo marcada', texto: 'marcada' }) : null
    ]);
    alvo.appendChild(rotulo);

    if (q.contexto) alvo.appendChild(paragrafos(q.contexto, 'contexto'));
    alvo.appendChild(paragrafos(q.enunciado, 'enunciado'));

    var alternativas = q.tipo === 'ce' ? ['Certo', 'Errado'] : q.alternativas;
    if (!s.ordem) {
      var indices = alternativas.map(function (_, i) { return i; });
      s.ordem = (estado.ajustes.embaralhar && q.tipo !== 'ce' && !q.naoEmbaralhar) ? embaralhar(indices) : indices;
    }

    var ul = el('ul', { class: 'alternativas' });
    s.ordem.forEach(function (idxOriginal, posicao) {
      var botao = el('button', { class: 'alt', type: 'button' }, [
        el('span', { class: 'letra', texto: LETRAS[posicao] }),
        el('span', { texto: alternativas[idxOriginal] })
      ]);
      botao.dataset.original = idxOriginal;
      if (s.revelado) {
        botao.disabled = true;
        if (idxOriginal === q.correta) botao.classList.add('certa');
        else if (idxOriginal === s.escolha) botao.classList.add('errada');
      } else {
        if (s.escolha === idxOriginal) botao.classList.add('escolhida');
        botao.addEventListener('click', function () {
          s.escolha = idxOriginal;
          renderizar();
        });
      }
      ul.appendChild(el('li', null, [botao]));
    });
    alvo.appendChild(ul);

    if (!s.revelado) {
      var rodape = el('div', { class: 'barra-fixa' }, [
        el('button', {
          class: 'btn principal largo',
          texto: 'Responder',
          disabled: s.escolha === null,
          onclick: responder
        })
      ]);
      alvo.appendChild(rodape);
      alvo.appendChild(el('div', { class: 'acoes' }, [
        el('button', {
          class: 'btn pequeno fantasma',
          texto: (p && p.marcada) ? 'Desmarcar questão' : 'Marcar para rever depois',
          onclick: function () {
            var pr = progressoDe(q.id);
            pr.marcada = !pr.marcada;
            salvarProgresso();
            renderizar();
          }
        })
      ]));
      return;
    }

    var acertou = s.escolha === q.correta;
    alvo.appendChild(el('p', {
      class: 'veredito ' + (acertou ? 'ok' : 'nao'),
      texto: acertou ? 'Você acertou.' : 'Gabarito: ' + LETRAS[s.ordem.indexOf(q.correta)] + '.'
    }));

    if (q.comentario) {
      var com = paragrafos(q.comentario, 'comentario');
      if (q.fundamento) com.appendChild(el('span', { class: 'fundamento', texto: q.fundamento }));
      alvo.appendChild(com);
    }

    var rodapeNotas = el('div', { class: 'barra-fixa' });
    if (!s.agenda) {
      rodapeNotas.appendChild(el('button', { class: 'btn principal largo', texto: 'Próxima', onclick: function () { avancar(0, acertou); } }));
    } else if (!acertou) {
      rodapeNotas.appendChild(el('button', {
        class: 'btn principal largo', texto: 'Continuar — repete em 10 min',
        onclick: function () { avancar(0, false); }
      }));
    } else {
      var notas = el('div', { class: 'notas' });
      [[3, 'Difícil'], [4, 'Bom'], [5, 'Fácil']].forEach(function (par) {
        notas.appendChild(el('button', {
          class: 'btn' + (par[0] === 4 ? ' principal' : ''),
          onclick: function () { avancar(par[0], true); }
        }, [
          document.createTextNode(par[1]),
          el('small', { texto: previsao(q.id, par[0]) })
        ]));
      });
      rodapeNotas.appendChild(notas);
    }
    alvo.appendChild(rodapeNotas);

    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn pequeno fantasma',
        texto: (p && p.marcada) ? 'Desmarcar questão' : 'Marcar para rever depois',
        onclick: function () {
          var pr = progressoDe(q.id);
          pr.marcada = !pr.marcada;
          salvarProgresso();
          renderizar();
        }
      }),
      el('button', { class: 'btn pequeno fantasma', texto: 'Copiar id: ' + q.id, onclick: function () { copiar(q.id); } })
    ]));
  }

  function responder() {
    var s = estado.sessao;
    if (s.escolha === null) return;
    s.revelado = true;
    renderizar();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function avancar(nota, acertou) {
    var s = estado.sessao;
    var id = s.fila[s.pos];
    aplicarNota(id, acertou ? nota : 0, acertou, s.agenda);

    s.respondidas += 1;
    if (acertou) s.acertos += 1;

    // Errou: a questão volta ao fim da fila, como no Anki.
    if (!acertou && s.agenda && s.fila.length < 400) s.fila.push(id);

    s.pos += 1;
    s.escolha = null;
    s.revelado = false;
    s.ordem = null;
    window.scrollTo(0, 0);
    renderizar();
  }

  function telaFim(alvo) {
    var s = estado.sessao;
    var taxa = s.respondidas ? Math.round((s.acertos / s.respondidas) * 100) : 0;
    alvo.appendChild(el('h2', { texto: 'Sessão concluída' }));
    alvo.appendChild(el('div', { class: 'resumo' }, [
      el('div', { class: 'bloco' }, [el('b', { texto: String(s.respondidas) }), el('span', { texto: 'respostas' })]),
      el('div', { class: 'bloco' }, [el('b', { texto: taxa + '%' }), el('span', { texto: 'de acerto' })]),
      el('div', { class: 'bloco' }, [el('b', { texto: String(s.respondidas - s.acertos) }), el('span', { texto: 'erros' })])
    ]));
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', { class: 'btn principal largo', texto: 'Voltar ao início', onclick: encerrar })
    ]));
  }

  /* ---------- tela: banco ---------- */

  function telaBanco(alvo) {
    titulo('Banco de questões');
    var f = estado.filtro;

    var selMateria = el('select', { onchange: function (e) { f.materia = e.target.value; f.topico = ''; renderizar(); } }, [
      el('option', { value: '', texto: 'Todas as matérias' })
    ]);
    estado.materias.forEach(function (m) {
      selMateria.appendChild(el('option', { value: m.id, texto: m.curto || m.nome, selected: f.materia === m.id }));
    });

    var selTopico = el('select', { onchange: function (e) { f.topico = e.target.value; renderizar(); } }, [
      el('option', { value: '', texto: 'Todos os tópicos' })
    ]);
    if (f.materia) {
      var m = materiaDe(f.materia);
      (m.topicos || []).forEach(function (t) {
        selTopico.appendChild(el('option', { value: t.codigo, texto: t.codigo + ' ' + t.nome, selected: f.topico === t.codigo }));
      });
    } else {
      selTopico.disabled = true;
    }

    alvo.appendChild(el('div', { class: 'filtros' }, [selMateria, selTopico]));

    var busca = el('input', { type: 'search', placeholder: 'Buscar no enunciado, tag ou id', value: f.busca });
    busca.addEventListener('input', function (e) {
      f.busca = e.target.value;
      clearTimeout(busca._t);
      busca._t = setTimeout(function () { desenharLista(); }, 250);
    });
    alvo.appendChild(busca);

    var caixa = el('div');
    alvo.appendChild(caixa);

    function desenharLista() {
      caixa.innerHTML = '';
      var termo = f.busca.trim().toLowerCase();
      var lista = filtrar(f.materia ? [f.materia] : [], f.topico ? [f.topico] : []).filter(function (q) {
        if (!termo) return true;
        var alvoTexto = (q.enunciado + ' ' + q.id + ' ' + (q.tags || []).join(' ')).toLowerCase();
        return alvoTexto.indexOf(termo) !== -1;
      });

      caixa.appendChild(el('p', { class: 'sub', texto: lista.length + ' questões' }));
      if (!lista.length) {
        caixa.appendChild(el('div', { class: 'vazio' }, [el('b', { texto: 'Nada encontrado' }), el('span', { texto: 'Mude os filtros ou adicione questões no repositório.' })]));
        return;
      }
      if (lista.length > 1) {
        caixa.appendChild(el('div', { class: 'acoes' }, [
          el('button', {
            class: 'btn', texto: 'Estudar estas ' + Math.min(lista.length, 60),
            onclick: function () {
              estado.sessao = {
                fila: embaralhar(lista).slice(0, 60).map(function (q) { return q.id; }),
                pos: 0, respondidas: 0, acertos: 0, modo: 'filtro', agenda: true,
                titulo: 'Seleção', escolha: null, revelado: false, ordem: null
              };
              renderizar();
            }
          })
        ]));
      }

      var ul = el('ul', { class: 'lista' });
      lista.slice(0, 300).forEach(function (q) {
        var mm = materiaDe(q.materiaId) || {};
        var p = estado.prog[q.id];
        var selo = ehNova(q) ? 'nova' : (p.due <= Date.now() ? 'vencida' : null);
        ul.appendChild(el('button', {
          class: 'questao-linha', estilo: '--rule:' + (mm.cor || 'var(--linha)'),
          onclick: function () { verQuestao(q); }
        }, [
          el('span', { class: 'trecho', texto: (q.enunciado || '').replace(/\n+/g, ' ').slice(0, 130) + '…' }),
          el('span', { class: 'tags' }, [
            document.createTextNode(q.id + ' · ' + q.topico + (p && p.reps ? ' · ' + p.acertos + '✓/' + p.erros + '✗' : '')),
            selo ? document.createTextNode(' ') : null,
            selo ? el('span', { class: 'selo ' + selo, texto: selo }) : null
          ])
        ]));
      });
      caixa.appendChild(ul);
    }
    desenharLista();
  }

  function verQuestao(q) {
    var alvo = document.getElementById('tela');
    alvo.innerHTML = '';
    var m = materiaDe(q.materiaId) || {};
    titulo(q.id);
    document.getElementById('barra-acoes').innerHTML = '';
    document.getElementById('barra-acoes').appendChild(
      el('button', { class: 'btn pequeno fantasma', texto: '‹ Voltar', onclick: function () { renderizar(); } })
    );

    alvo.appendChild(el('div', { class: 'rotulo-questao', estilo: '--rule:' + (m.cor || 'var(--acento)') }, [
      el('span', { class: 'pino', texto: m.curto || q.materiaId }),
      el('span', { texto: q.topico + ' ' + ((m.mapaTopicos && m.mapaTopicos[q.topico]) || '') }),
      el('span', { texto: q.dificuldade || '' })
    ]));
    if (q.contexto) alvo.appendChild(paragrafos(q.contexto, 'contexto'));
    alvo.appendChild(paragrafos(q.enunciado, 'enunciado'));

    var alternativas = q.tipo === 'ce' ? ['Certo', 'Errado'] : q.alternativas;
    var ul = el('ul', { class: 'alternativas' });
    alternativas.forEach(function (texto, i) {
      ul.appendChild(el('li', null, [
        el('div', { class: 'alt' + (i === q.correta ? ' certa' : '') }, [
          el('span', { class: 'letra', texto: LETRAS[i] }),
          el('span', { texto: texto })
        ])
      ]));
    });
    alvo.appendChild(ul);

    if (q.comentario) {
      var com = paragrafos(q.comentario, 'comentario');
      if (q.fundamento) com.appendChild(el('span', { class: 'fundamento', texto: q.fundamento }));
      alvo.appendChild(com);
    }

    var p = estado.prog[q.id];
    alvo.appendChild(el('p', {
      class: 'sub',
      texto: p && p.reps
        ? 'Respondida ' + p.reps + 'x · ' + p.acertos + ' acertos · próxima revisão em ' + formatarIntervalo(p.intervalo)
        : 'Ainda não respondida.'
    }));
  }

  /* ---------- tela: progresso ---------- */

  function telaProgresso(alvo) {
    titulo('Progresso');
    var geral = contagens();
    var respondidas = geral.acertos + geral.erros;
    var taxa = respondidas ? Math.round((geral.acertos / respondidas) * 100) : 0;

    alvo.appendChild(el('div', { class: 'resumo' }, [
      el('div', { class: 'bloco' }, [el('b', { texto: String(respondidas) }), el('span', { texto: 'respostas' })]),
      el('div', { class: 'bloco' }, [el('b', { texto: taxa + '%' }), el('span', { texto: 'de acerto' })]),
      el('div', { class: 'bloco' }, [el('b', { texto: String(geral.consolidadas) }), el('span', { texto: 'consolidadas' })])
    ]));

    alvo.appendChild(el('h2', { texto: 'Últimos 14 dias' }));
    var grafico = el('div', { class: 'semanal' });
    var maximo = 1;
    var dias = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(Date.now() - i * DIA);
      var reg = estado.diario[diaChave(d)] || { respostas: 0, acertos: 0 };
      maximo = Math.max(maximo, reg.respostas);
      dias.push({ d: d, reg: reg });
    }
    dias.forEach(function (item) {
      var altura = (item.reg.respostas / maximo) * 72;
      var erros = item.reg.respostas - item.reg.acertos;
      var alturaErro = item.reg.respostas ? altura * (erros / item.reg.respostas) : 0;
      grafico.appendChild(el('div', { class: 'col' }, [
        el('i', { estilo: 'height:' + Math.max(0, altura - alturaErro) + 'px' }),
        alturaErro ? el('i', { class: 'erro', estilo: 'height:' + alturaErro + 'px' }) : null,
        el('em', { texto: String(item.d.getDate()) })
      ]));
    });
    alvo.appendChild(grafico);

    alvo.appendChild(el('h2', { texto: 'Domínio por matéria' }));
    estado.materias.forEach(function (m) {
      var c = contagens(m.id);
      if (!c.total) return;
      var resp = c.acertos + c.erros;
      var pct = resp ? Math.round((c.acertos / resp) * 100) : 0;
      var pctCons = Math.round((c.consolidadas / c.total) * 100);
      var pctVistas = Math.round(((c.total - c.novas) / c.total) * 100);
      alvo.appendChild(el('div', { class: 'barra-materia' }, [
        el('div', { class: 'topo' }, [
          el('span', { texto: m.curto || m.nome }),
          el('span', { texto: resp ? pct + '% acerto · ' + c.consolidadas + '/' + c.total : 'sem respostas' })
        ]),
        el('div', { class: 'medida' }, [
          el('i', { class: 'dominio', estilo: 'width:' + pctCons + '%' }),
          el('i', { class: 'aprendendo', estilo: 'width:' + Math.max(0, pctVistas - pctCons) + '%' })
        ])
      ]));
    });

    alvo.appendChild(el('h2', { texto: 'Próximos 7 dias' }));
    var previsoes = [];
    for (var j = 0; j < 7; j++) {
      var inicio = new Date(); inicio.setHours(0, 0, 0, 0);
      var ini = inicio.getTime() + j * DIA;
      var fim = ini + DIA;
      var n = 0;
      Object.keys(estado.prog).forEach(function (id) {
        var p = estado.prog[id];
        if (p.reps > 0 && p.due >= ini && p.due < fim && estado.porId.has(id)) n += 1;
      });
      previsoes.push(n);
    }
    alvo.appendChild(el('p', { class: 'sub', texto: previsoes.map(function (n, k) { return (k === 0 ? 'hoje' : '+' + k) + ': ' + n; }).join('   ') }));
  }

  /* ---------- tela: ajustes ---------- */

  function telaAjustes(alvo) {
    titulo('Ajustes');

    function campoNumero(rotulo, dica, chave, min, max) {
      var input = el('input', { type: 'number', min: min, max: max, value: estado.ajustes[chave] });
      input.addEventListener('change', function () {
        var v = Math.max(min, Math.min(max, parseInt(input.value, 10) || min));
        estado.ajustes[chave] = v;
        input.value = v;
        salvarAjustes();
      });
      return el('div', { class: 'campo' }, [
        el('label', null, [document.createTextNode(rotulo), el('span', { class: 'dica', texto: dica })]),
        input
      ]);
    }

    alvo.appendChild(el('h2', { texto: 'Estudo' }));
    alvo.appendChild(campoNumero('Novas por dia', 'Quantas questões inéditas entram por dia', 'novasPorDia', 0, 200));
    alvo.appendChild(campoNumero('Máximo de revisões', 'Teto de questões vencidas por sessão', 'maxRevisoes', 10, 500));
    alvo.appendChild(campoNumero('Tamanho do simulado', 'Questões sorteadas no modo simulado', 'tamanhoSimulado', 5, 120));

    var chk = el('input', { type: 'checkbox' });
    chk.checked = estado.ajustes.embaralhar;
    chk.addEventListener('change', function () { estado.ajustes.embaralhar = chk.checked; salvarAjustes(); });
    alvo.appendChild(el('div', { class: 'campo' }, [
      el('label', null, [document.createTextNode('Embaralhar alternativas'), el('span', { class: 'dica', texto: 'Evita decorar a posição do gabarito' })]),
      chk
    ]));

    var tema = el('select', { onchange: function (e) { estado.ajustes.tema = e.target.value; salvarAjustes(); aplicarTema(); } });
    [['auto', 'Seguir o sistema'], ['claro', 'Claro'], ['escuro', 'Escuro']].forEach(function (op) {
      tema.appendChild(el('option', { value: op[0], texto: op[1], selected: estado.ajustes.tema === op[0] }));
    });
    alvo.appendChild(el('div', { class: 'campo' }, [el('label', { texto: 'Tema' }), tema]));

    alvo.appendChild(el('h2', { texto: 'Questões' }));
    alvo.appendChild(el('p', { class: 'sub', texto: 'As questões vêm dos arquivos JSON do repositório. Buscar novidades não apaga seu histórico.' }));
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn principal largo', texto: 'Buscar novas questões',
        onclick: async function (e) {
          var botao = e.currentTarget;
          botao.disabled = true;
          botao.textContent = 'Buscando…';
          var antes = estado.porId.size;
          try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ tipo: 'limpar-dados' });
            }
            var total = await carregarBanco(true);
            var novas = total - antes;
            aviso(novas > 0 ? novas + ' questões novas adicionadas.' : 'Banco já está atualizado (' + total + ' questões).');
          } catch (erro) {
            aviso('Falha ao buscar. Verifique a conexão.');
          }
          renderizar();
        }
      })
    ]));

    alvo.appendChild(el('h2', { texto: 'Backup do progresso' }));
    var ultimo = ler(K.backup, null);
    alvo.appendChild(el('p', {
      class: 'sub',
      texto: ultimo ? 'Último backup: ' + new Date(ultimo).toLocaleDateString('pt-BR') : 'Você ainda não exportou nenhum backup. Faça isso de tempos em tempos.'
    }));

    var entradaArquivo = el('input', { type: 'file', accept: '.json,application/json', estilo: 'display:none' });
    entradaArquivo.addEventListener('change', function () {
      var arquivo = entradaArquivo.files[0];
      if (!arquivo) return;
      var leitor = new FileReader();
      leitor.onload = function () { importar(leitor.result); };
      leitor.readAsText(arquivo);
    });

    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', { class: 'btn', texto: 'Exportar backup', onclick: exportar }),
      el('button', { class: 'btn', texto: 'Importar backup', onclick: function () { entradaArquivo.click(); } }),
      el('button', { class: 'btn', texto: 'Copiar backup', onclick: function () { copiar(JSON.stringify(pacoteBackup())); } })
    ]));
    alvo.appendChild(entradaArquivo);

    alvo.appendChild(el('h2', { texto: 'Zona de risco' }));
    alvo.appendChild(el('div', { class: 'acoes' }, [
      el('button', {
        class: 'btn', texto: 'Zerar agendamento',
        onclick: function () {
          if (!confirm('Isso apaga todo o histórico de revisões deste aparelho. Continuar?')) return;
          estado.prog = {}; estado.diario = {};
          salvarProgresso(); salvarDiario();
          aviso('Progresso zerado.');
          renderizar();
        }
      })
    ]));

    alvo.appendChild(el('p', {
      class: 'sub',
      texto: 'Versão ' + VERSAO_APP + ' · banco de ' + ((estado.indice && estado.indice.versao) || '—') + ' · ' + estado.porId.size + ' questões'
    }));
  }

  /* ---------- backup ---------- */

  function pacoteBackup() {
    return {
      tipo: 'questoes-rfb-backup',
      versao: VERSAO_APP,
      exportadoEm: new Date().toISOString(),
      progresso: estado.prog,
      diario: estado.diario,
      ajustes: estado.ajustes
    };
  }

  function exportar() {
    var conteudo = JSON.stringify(pacoteBackup(), null, 2);
    var blob = new Blob([conteudo], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'questoes-rfb-backup-' + diaChave() + '.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    gravar(K.backup, Date.now());
    aviso('Backup gerado. Guarde no Arquivos ou iCloud.');
  }

  function importar(texto) {
    var dados;
    try { dados = JSON.parse(texto); } catch (e) { aviso('Arquivo inválido.'); return; }
    if (!dados || !dados.progresso) { aviso('Este arquivo não é um backup do app.'); return; }

    var adicionados = 0, atualizados = 0;
    Object.keys(dados.progresso).forEach(function (id) {
      var novo = dados.progresso[id];
      var atual = estado.prog[id];
      if (!atual) { estado.prog[id] = novo; adicionados += 1; }
      else if ((novo.ultimaRev || 0) > (atual.ultimaRev || 0)) { estado.prog[id] = novo; atualizados += 1; }
    });

    Object.keys(dados.diario || {}).forEach(function (d) {
      var origem = dados.diario[d];
      var atual = estado.diario[d];
      if (!atual || origem.respostas > atual.respostas) estado.diario[d] = origem;
    });

    if (dados.ajustes) estado.ajustes = Object.assign({}, AJUSTES_PADRAO, dados.ajustes);
    salvarProgresso(); salvarDiario(); salvarAjustes(); aplicarTema();
    aviso(adicionados + ' importadas, ' + atualizados + ' atualizadas.');
    renderizar();
  }

  function copiar(texto) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () { aviso('Copiado.'); });
    } else {
      var t = el('textarea', { estilo: 'position:fixed;opacity:0' });
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
      aviso('Copiado.');
    }
  }

  /* ---------- teclado (desktop) ---------- */

  document.addEventListener('keydown', function (e) {
    var s = estado.sessao;
    if (!s || s.pos >= s.fila.length) return;
    var q = estado.porId.get(s.fila[s.pos]);
    if (!q) return;

    if (!s.revelado) {
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= s.ordem.length) { s.escolha = s.ordem[n - 1]; renderizar(); }
      if (e.key === 'Enter' && s.escolha !== null) responder();
    } else {
      var acertou = s.escolha === q.correta;
      if (!s.agenda || !acertou) { if (e.key === 'Enter' || e.key === ' ') avancar(0, acertou); return; }
      if (e.key === '1') avancar(3, true);
      if (e.key === '2' || e.key === 'Enter' || e.key === ' ') avancar(4, true);
      if (e.key === '3') avancar(5, true);
    }
  });

  /* ---------- inicialização ---------- */

  document.querySelectorAll('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () { irPara(b.dataset.tela); });
  });

  (async function iniciarApp() {
    carregarLocal();
    try {
      await carregarBanco(false);
    } catch (e) {
      document.getElementById('tela').innerHTML = '';
      document.getElementById('tela').appendChild(el('div', { class: 'vazio' }, [
        el('b', { texto: 'Não foi possível carregar as questões' }),
        el('span', { texto: 'Abra o app pelo endereço do GitHub Pages. Se estiver offline, conecte-se uma vez para baixar o banco.' })
      ]));
      return;
    }
    renderizar();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
  })();
})();
