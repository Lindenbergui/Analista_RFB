# Prompt para gerar questões

Cole o texto abaixo em uma conversa nova, preenchendo o que está entre colchetes. Gere **um tópico por vez**: lotes menores saem com comentário melhor e são mais fáceis de conferir.

---

Você é examinador da FGV elaborando questões para o cargo de **Analista-Tributário da Receita Federal do Brasil**.

**Tópico do edital:** [ex.: 9.14 Crédito tributário: lançamento, suspensão, extinção]
**Matéria:** [ex.: Direito Tributário]
**Quantidade:** [ex.: 15 questões]
**Ids:** numere sequencialmente a partir de [ex.: dtrib-0031]

Estilo da banca, obrigatório:

- Cinco alternativas (A a E), uma única correta, todas com extensão parecida e todas plausíveis.
- Comando direto no fim do enunciado: "Assinale a opção correta.", "Assinale a afirmativa incorreta.", "É correto afirmar que:".
- Metade das questões com caso concreto curto (um contribuinte, um servidor, uma repartição) antes da pergunta; a outra metade cobrando o texto da lei ou a classificação doutrinária.
- Distratores construídos sobre os erros que realmente derrubam candidato: trocar prazo, trocar competência, trocar suspensão por extinção, inverter exceção e regra, generalizar o que a lei restringe.
- Nada de pegadinha por leitura apressada ("não", "exceto" escondidos): a FGV cobra conteúdo, não desatenção. Quando usar negativa no comando, deixe-a evidente.

Cobertura: distribua as questões por todos os recortes possíveis do tópico — conceito, requisitos, prazos, competência, exceções, efeitos, interação com outros institutos e a jurisprudência sumulada mais cobrada. Antes de escrever, liste os recortes que pretende cobrir e só então redija.

Conteúdo: use a redação vigente da legislação; se houver divergência doutrinária, cobre a posição majoritária e diga isso no comentário. Não invente número de artigo — se não tiver certeza da referência, escreva o fundamento de forma genérica.

Comentário: dois a quatro períodos, explicando por que a correta está certa e derrubando ao menos os dois distratores mais atraentes.

Saída: **apenas** um array JSON válido, sem texto em volta, sem blocos de código, no formato:

```json
[
  {
    "id": "dtrib-0031",
    "topico": "9.14",
    "tipo": "multipla",
    "contexto": "",
    "enunciado": "…\n\nAssinale a opção correta.",
    "alternativas": ["…", "…", "…", "…", "…"],
    "correta": 0,
    "comentario": "…",
    "fundamento": "CTN, art. 151, II.",
    "dificuldade": "media",
    "tags": ["…"],
    "fonte": "inédita"
  }
]
```

`correta` é o índice da alternativa correta começando em 0. Varie a posição do gabarito entre as cinco letras. Omita `contexto` quando não houver. `dificuldade`: `facil`, `media` ou `dificil`.

---

## Depois de gerar

1. Abra o arquivo da matéria em `data/`, cole os objetos dentro do array `questoes` (atenção às vírgulas).
2. Rode `python3 tools/validar.py`.
3. Faça commit e push. No celular: Ajustes › Buscar novas questões.

## Ordem sugerida de produção

Comece pelo que mais cai e mais pesa: Legislação Tributária e Direito Tributário, depois Aduaneira, Administrativo, Constitucional, Administração e Fluência em Dados. Dentro de cada matéria, siga a ordem do edital — `tools/validar.py` mostra quantas questões cada tópico já tem, então é fácil ver onde parou.
