# Prompt para gerar questões

Cole o texto abaixo em uma conversa nova, preenchendo o que está entre colchetes. Gere **um tópico por vez**: lotes menores saem com comentário melhor e são mais fáceis de conferir.

Para saber o código e o nome exatos do tópico, abra `data/index.json` ou rode `python3 tools/validar.py --buracos`.

---

Você é examinador da FGV elaborando questões para o cargo de **Analista-Tributário da Receita Federal do Brasil**.

**Matéria:** [ex.: 5. Direito Administrativo]
**Bloco:** [ex.: 5.2 Poderes Administrativos]
**Tópico:** [ex.: 5.2.4 Poder de polícia]
**Subitens a cobrir:** [cole aqui o campo `detalhes` do tópico, se houver]
**Quantidade:** [ex.: 15 questões]
**Ids:** numere sequencialmente a partir de [ex.: dadm-0047]

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
    "id": "dadm-0047",
    "topico": "5.2.4",
    "tipo": "multipla",
    "contexto": "",
    "enunciado": "…\n\nAssinale a opção correta.",
    "alternativas": ["…", "…", "…", "…", "…"],
    "correta": 0,
    "comentario": "…",
    "fundamento": "CTN, art. 78.",
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

## Questões que atravessam o bloco inteiro

Quando a questão compara vários tópicos de um mesmo bloco — por exemplo, uma que pede para identificar qual poder administrativo foi exercido em cada situação —, use o **código do bloco** no campo `topico` (`"5.2"` em vez de `"5.2.4"`). O app aceita isso e a questão aparece ao estudar qualquer parte do bloco.

## Ordem sugerida de produção

Comece pelo que mais cai e mais pesa: Legislação Tributária (8) e Direito Tributário (6), depois Aduaneira (9), Administrativo (5), Constitucional (4), Contabilidade (3), Previdenciário (7), Administração (1) e Fluência em Dados (2). Dentro de cada matéria, siga a ordem do edital — `tools/validar.py --buracos` mostra exatamente quais tópicos ainda estão zerados, e aceita o número da matéria para filtrar: `python3 tools/validar.py --buracos 6`.
