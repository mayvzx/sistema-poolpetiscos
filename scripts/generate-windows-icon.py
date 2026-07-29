"""Gera o ícone multirresolução do Windows a partir da marca existente.

Uso:
    python scripts/generate-windows-icon.py

O arquivo de origem continua sendo a referência visual do site. O script
apenas centraliza a imagem, recorta-a em formato circular e gera os tamanhos
necessários para o executável e o instalador do Windows.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)


def generate_icon(source: Path, destination: Path) -> None:
    with Image.open(source) as opened_image:
        source_image = ImageOps.exif_transpose(opened_image).convert("RGB")

    side = min(source_image.size)
    left = (source_image.width - side) // 2
    top = (source_image.height - side) // 2
    square = source_image.crop((left, top, left + side, top + side))
    icon = square.resize((256, 256), Image.Resampling.LANCZOS).convert("RGBA")

    # O recorte circular remove somente os cantos brancos da fotografia da
    # marca. A pequena margem evita que a borda vermelha encoste no limite do
    # ícone na barra de tarefas e nos atalhos.
    scale = 4
    mask = Image.new("L", (256 * scale, 256 * scale), 0)
    drawer = ImageDraw.Draw(mask)
    margin = 3 * scale
    drawer.ellipse(
        (margin, margin, mask.width - margin - 1, mask.height - margin - 1),
        fill=255,
    )
    mask = mask.resize((256, 256), Image.Resampling.LANCZOS)
    icon.putalpha(mask)

    destination.parent.mkdir(parents=True, exist_ok=True)
    icon.save(
        destination,
        format="ICO",
        sizes=[(size, size) for size in ICON_SIZES],
        bitmap_format="png",
    )


def parse_arguments() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Gera o ícone oficial do Pool Petiscos para Windows."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=project_root / "public" / "pool-logo-round.jpg",
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=project_root / "installer" / "assets" / "pool-petiscos.ico",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    generate_icon(arguments.source.resolve(), arguments.destination.resolve())
    print(f"Ícone gerado em {arguments.destination.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
