#!/usr/bin/env python3
"""Valida o banco de questões e mostra a cobertura por tópico do edital.

Uso:
    python3 tools/validar.py            # valida e resume
    python3 tools/validar.py --buracos  # lista só os tópicos sem questões
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


def falhar(msg):
    erros.append(msg)


def main():
    so_buracos = "--buracos" in sys.argv

    indice = json.loads((DADOS / "index.json").read_text(encoding="utf-8"))
    vistos = {}
    total = 0
    linhas = []

    for materia in indice["materias"]:
        codigos = {t["codigo"] for t in materia.get("topicos", [])}
        contagem = {c: 0 for c in codigos}
        caminho = DADOS / materia["arquivo"]

        if not caminho.exists():
            avisos.append(f'{materia["nome"]}: arquivo {materia["arquivo"]} ainda não existe.')
            questoes = []
        else:
            try:
                conteudo = json.loads(caminho.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                falhar(f'{materia["arquivo"]}: JSON inválido — {e}')
                continue
            questoes = conteudo.get("questoes", [])
            if conteudo.get("materia") != materia["id"]:
                falhar(f'{materia["arquivo"]}: campo "materia" deveria ser "{materia["id"]}".')

        for i, q in enumerate(questoes):
            rotulo = q.get("id", f'{materia["arquivo"]}#{i}')

            for campo in OBRIGATORIOS:
                if campo not in q:
                    falhar(f"{rotulo}: falta o campo obrigatório '{campo}'.")

            qid = q.get("id")
            if qid in vistos:
                falhar(f"{rotulo}: id duplicado (também em {vistos[qid]}).")
            elif qid:
                vistos[qid] = materia["arquivo"]
                if not qid.startswith(materia["id"] + "-"):
                    avisos.append(f'{rotulo}: id não começa com "{materia["id"]}-".')

            tipo = q.get("tipo", "multipla")
            alternativas = ["Certo", "Errado"] if tipo == "ce" else q.get("alternativas", [])
            if tipo != "ce":
                if not isinstance(alternativas, list) or len(alternativas) < 2:
                    falhar(f"{rotulo}: precisa de ao menos 2 alternativas.")
                elif len(alternativas) != 5:
                    avisos.append(f"{rotulo}: {len(alternativas)} alternativas (a FGV usa 5).")

            correta = q.get("correta")
            if not isinstance(correta, int) or not (0 <= correta < len(alternativas)):
                falhar(f"{rotulo}: 'correta' fora da faixa de alternativas (recebido: {correta!r}).")

            topico = q.get("topico")
            if topico not in codigos:
                falhar(f'{rotulo}: tópico "{topico}" não existe em {materia["nome"]}.')
            else:
                contagem[topico] += 1

            if not q.get("comentario"):
                avisos.append(f"{rotulo}: sem comentário do gabarito.")
            if q.get("dificuldade") and q["dificuldade"] not in DIFICULDADES:
                avisos.append(f'{rotulo}: dificuldade "{q["dificuldade"]}" fora do padrão.')

        total += len(questoes)
        linhas.append((materia, contagem, len(questoes)))

    print(f"\n{total} questões no banco\n")
    for materia, contagem, n in linhas:
        vazios = [c for c, v in contagem.items() if v == 0]
        print(f'{materia["nome"]}: {n} questões · {len(contagem) - len(vazios)}/{len(contagem)} tópicos cobertos')
        if so_buracos and vazios:
            ordenados = sorted(vazios, key=lambda c: [int(p) for p in c.split(".")])
            print("   sem questões: " + ", ".join(ordenados))

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
