#!/usr/bin/env python3
"""Valida o banco de questões e mostra a cobertura do programa do edital.

Uso:
    python3 tools/validar.py              # valida e resume
    python3 tools/validar.py --buracos    # lista os tópicos ainda sem questões
    python3 tools/validar.py --buracos 6  # idem, só da matéria número 6
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
OBRIGATORIOS = ["id", "topico", "enunciado", "correta"]
DIFICULDADES = {"facil", "media", "dificil"}

erros = []
avisos = []


def ordem(codigo):
    return [int(p) for p in codigo.split(".")]


def main():
    args = sys.argv[1:]
    so_buracos = "--buracos" in args
    filtro_materia = next((a for a in args if a.isdigit()), None)

    indice = json.loads((DADOS / "index.json").read_text(encoding="utf-8"))
    vistos = {}
    total = 0
    linhas = []

    for materia in indice["materias"]:
        blocos = materia.get("blocos", [])
        # códigos aceitos: o de cada tópico e o de cada bloco (questão transversal)
        codigos_topico = [t["codigo"] for b in blocos for t in b.get("topicos", [])]
        aceitos = set(codigos_topico) | {b["codigo"] for b in blocos}
        contagem = {c: 0 for c in codigos_topico}

        caminho = DADOS / materia["arquivo"]
        if not caminho.exists():
            avisos.append(f'{materia["nome"]}: falta o arquivo {materia["arquivo"]}.')
            questoes = []
        else:
            try:
                conteudo = json.loads(caminho.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                erros.append(f'{materia["arquivo"]}: JSON inválido — {e}')
                continue
            questoes = conteudo.get("questoes", [])
            if conteudo.get("materia") != materia["id"]:
                erros.append(
                    f'{materia["arquivo"]}: campo "materia" deveria ser "{materia["id"]}".'
                )

        for i, q in enumerate(questoes):
            rotulo = q.get("id", f'{materia["arquivo"]}#{i}')

            for campo in OBRIGATORIOS:
                if campo not in q:
                    erros.append(f"{rotulo}: falta o campo obrigatório '{campo}'.")

            qid = q.get("id")
            if qid in vistos:
                erros.append(f"{rotulo}: id duplicado (também em {vistos[qid]}).")
            elif qid:
                vistos[qid] = materia["arquivo"]
                if not qid.startswith(materia["id"] + "-"):
                    avisos.append(f'{rotulo}: id não começa com "{materia["id"]}-".')

            tipo = q.get("tipo", "multipla")
            alternativas = ["Certo", "Errado"] if tipo == "ce" else q.get("alternativas", [])
            if tipo != "ce":
                if not isinstance(alternativas, list) or len(alternativas) < 2:
                    erros.append(f"{rotulo}: precisa de ao menos 2 alternativas.")
                elif len(alternativas) != 5:
                    avisos.append(f"{rotulo}: {len(alternativas)} alternativas (a FGV usa 5).")

            correta = q.get("correta")
            if not isinstance(correta, int) or not (0 <= correta < len(alternativas)):
                erros.append(
                    f"{rotulo}: 'correta' fora da faixa de alternativas (recebido: {correta!r})."
                )

            topico = q.get("topico")
            if topico not in aceitos:
                erros.append(
                    f'{rotulo}: tópico "{topico}" não existe em {materia["nome"]}.'
                )
            else:
                # conta no próprio tópico, ou em todos os do bloco quando transversal
                if topico in contagem:
                    contagem[topico] += 1
                else:
                    for c in codigos_topico:
                        if c.startswith(topico + "."):
                            contagem[c] += 1
                            break

            if not q.get("comentario"):
                avisos.append(f"{rotulo}: sem comentário do gabarito.")
            if q.get("dificuldade") and q["dificuldade"] not in DIFICULDADES:
                avisos.append(f'{rotulo}: dificuldade "{q["dificuldade"]}" fora do padrão.')

        total += len(questoes)
        linhas.append((materia, contagem, len(questoes)))

    print(f"\n{total} questões no banco · edital de {indice.get('versao', '—')}\n")
    for materia, contagem, n in linhas:
        vazios = [c for c, v in contagem.items() if v == 0]
        cobertos = len(contagem) - len(vazios)
        print(
            f'{materia["numero"]}. {materia["nome"]}: '
            f"{n} questões · {cobertos}/{len(contagem)} tópicos cobertos"
        )
        if so_buracos and vazios and (not filtro_materia or filtro_materia == materia["numero"]):
            for c in sorted(vazios, key=ordem):
                nome = next(
                    t["nome"]
                    for b in materia["blocos"]
                    for t in b["topicos"]
                    if t["codigo"] == c
                )
                print(f"     {c}  {nome}")

    if avisos and not so_buracos:
        print(f"\n{len(avisos)} avisos:")
        for a in avisos[:20]:
            print("  · " + a)
        if len(avisos) > 20:
            print(f"  · … e mais {len(avisos) - 20}")

    if erros:
        print(f"\n{len(erros)} erros:")
        for e in erros:
            print("  ✗ " + e)
        return 1

    print("\nBanco válido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
