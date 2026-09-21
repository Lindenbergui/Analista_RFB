# Questões RFB

Plataforma pessoal de revisão por questões (estilo Anki) para o concurso de Analista-Tributário da Receita Federal, banca FGV.

É um PWA estático: roda no GitHub Pages, instala na tela de início do iPhone, funciona offline e guarda o progresso no próprio aparelho. Você pode acrescentar questões no repositório quantas vezes quiser — **o histórico salvo no celular nunca é apagado por isso**, porque o progresso é gravado por `id` de questão, não por arquivo.

---

## 1. Publicar no GitHub Pages

1. Crie um repositório (público ou privado com Pages habilitado) e suba todo o conteúdo desta pasta na raiz.
2. No GitHub: **Settings › Pages › Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Aguarde 1–2 minutos. O endereço será `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

O arquivo `.nojekyll` já está incluído para o GitHub não processar nada indevidamente.

## 2. Instalar no iPhone

1. Abra o endereço **no Safari** (não funciona pelo Chrome no iOS para instalar).
2. Toque em Compartilhar › **Adicionar à Tela de Início**.
3. Abra sempre pelo ícone. O app roda em tela cheia e offline.

> Use sempre o mesmo endereço. O progresso fica vinculado ao domínio: se mudar o nome do repositório, o histórico antigo não é encontrado (mas pode ser recuperado por backup).

## 3. Rotina de uso

- **Hoje** mostra o que está vencido. Toque em "Revisar tudo" para uma sessão geral ou escolha uma matéria — e, dentro dela, um tópico do edital.
- Responda, veja o gabarito comentado e classifique: **Difícil / Bom / Fácil**. Errou, a questão volta em 10 minutos e é reagendada do zero.
- **Simulado** sorteia questões sem mexer no agendamento — bom para medir desempenho.
- **Revisar erros** junta tudo que você errou na última tentativa.

## 4. Acrescentar questões

Edite os arquivos em `data/`. Um arquivo por matéria:

| Matéria | Arquivo | Prefixo dos ids |
|---|---|---|
| Administração Geral e Pública | `administracao.json` | `adm-` |
| Fluência em Dados | `dados.json` | `dados-` |
| Direito Constitucional | `constitucional.json` | `const-` |
| Direito Administrativo | `administrativo.json` | `dadm-` |
| Direito Tributário | `tributario.json` | `dtrib-` |
| Legislação Tributária | `legislacao-tributaria.json` | `ltrib-` |
| Legislação Aduaneira | `aduaneira.json` | `lad-` |

### Formato de uma questão

```json
{
  "id": "dtrib-0031",
  "topico": "9.14",
  "tipo": "multipla",
  "contexto": "Texto-base opcional, quando a questão depende de um caso concreto.",
  "enunciado": "Pergunta da questão.\n\nAssinale a opção correta.",
  "alternativas": ["A…", "B…", "C…", "D…", "E…"],
  "correta": 2,
  "comentario": "Por que a correta está certa e onde as outras tropeçam.",
  "fundamento": "CTN, art. 151.",
  "dificuldade": "media",
  "tags": ["credito-tributario"],
  "fonte": "FGV 2023 adaptada"
}
```

Regras que importam:

- **`id` é para sempre.** Nunca reutilize nem renomeie um id: ele é a chave do seu histórico. Se uma questão estiver errada, corrija o texto mantendo o id; se ela não servir mais, apague a questão (o histórico órfão é simplesmente ignorado).
- **`correta` é o índice da alternativa, começando em 0.** Na lista acima, `2` é a terceira alternativa.
- `topico` precisa ser um código existente em `data/index.json` (ex.: `9.14`).
- `tipo` aceita `"multipla"` (padrão FGV, cinco alternativas) ou `"ce"` (certo/errado — nesse caso omita `alternativas` e use `correta: 0` para Certo e `1` para Errado).
- `\n\n` no enunciado vira quebra de parágrafo.
- Quebrar a ordem das alternativas é automático. Se a questão tiver alternativas do tipo "todas as anteriores", acrescente `"naoEmbaralhar": true`.

### Depois de subir novas questões

No celular: **Ajustes › Buscar novas questões**. O app baixa os arquivos atualizados e mantém intacto todo o seu agendamento.

### Conferir antes de publicar

```bash
python3 tools/validar.py
```

Aponta ids duplicados, índices de gabarito fora da faixa, tópicos inexistentes e mostra quantas questões existem por tópico do edital — útil para enxergar os buracos. O GitHub Actions roda essa checagem a cada push.

## 5. Backup

O progresso vive no `localStorage` do Safari. É confiável para um app instalado na tela de início, mas não é eterno: reinstalar o app ou limpar dados do Safari apaga tudo.

**Ajustes › Exportar backup** gera um `.json` que você salva no Arquivos/iCloud. Para restaurar, ou para levar o histórico a outro aparelho, use **Importar backup** — a fusão é por questão, mantendo sempre a revisão mais recente. Vale fazer isso uma vez por mês.

## 6. Como o agendamento funciona

Variação do SM-2 (o algoritmo clássico do Anki):

- Questão nova: **Bom** → 1 dia; **Fácil** → 3 dias; **Difícil** → volta em 10 minutos.
- Em revisão: o intervalo é multiplicado pelo fator de facilidade (começa em 2,5, sobe com "Fácil", desce com "Difícil"), com teto de 365 dias.
- Erro: fator de facilidade cai, intervalo zera, a questão reaparece ainda na mesma sessão.
- "Novas por dia" e "Máximo de revisões" limitam o tamanho da sessão (Ajustes).

## Estrutura

```
index.html                 shell do app
assets/app.css             estilos
assets/app.js              lógica: dados, repetição espaçada, telas
sw.js                      service worker (offline)
manifest.webmanifest       instalação como app
data/index.json            matérias, cores e tópicos do edital
data/*.json                bancos de questões por matéria
docs/PROMPT-GERADOR.md     prompt pronto para gerar questões no formato
tools/validar.py           validador do banco
```
