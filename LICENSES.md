# Third-party licences

Every dependency is open source. This file records which licence, because
they differ in what they require of *your* code.

## Permissive — no obligation on your source

| Package | Licence |
|---|---|
| torch, torchvision | BSD-3-Clause |
| numpy, Pillow, scikit-learn, pandas | BSD-3-Clause / HPND |
| imagehash | BSD-2-Clause |
| opencv-python | Apache-2.0 |
| open-clip-torch | MIT |
| transformers (SAM backend) | Apache-2.0 |
| fastapi, python-multipart | MIT / Apache-2.0 |
| uvicorn, requests | BSD-3-Clause / Apache-2.0 |
| streamlit | Apache-2.0 |
| matplotlib | PSF-based (BSD-compatible) |
| python-docx, openpyxl, python-pptx | MIT |
| tqdm | MPL-2.0 AND MIT (file-level copyleft only) |

## Copyleft — none

There are **no copyleft dependencies**. `ultralytics` (YOLOv8, AGPL-3.0) was the
only one and it has been removed from the code and uninstalled from the venv.

AGPL-3.0 *is* an OSI-approved open-source licence. The issue was never openness,
it was reciprocity: AGPL §13 means serving it over a network obliges you to offer
the complete source of **the whole service** under AGPL.

Measured on the 48-image restaurant benchmark, removing it cost nothing on the
metric that matters:

| Backend | Licence | 3-tier diet | Dish | Speed | Download |
|---|---|---|---|---|---|
| **grabcut** (default) | Apache-2.0 | **95.83%** | 82.93% | ~0.2 s | none |
| sam | Apache-2.0 | **95.83%** | 85.37% | ~1.4 s | ~375 MB |
| ~~yolo~~ (removed) | AGPL-3.0 | 95.83% | 85.37% | ~0.45 s | 7 MB |

Verified: a default run loads zero `ultralytics` modules, and the benchmark is
unchanged with the package uninstalled.

## Model weights

Weights carry their own terms, separate from the code that loads them.

- **torchvision MobileNetV3 / EfficientNet** — BSD-3-Clause code, ImageNet-pretrained.
  ImageNet's own terms are written for non-commercial research use. This is widely
  ignored in practice but is worth stating explicitly before commercial deployment.
- **SAM (`facebook/sam-vit-base`)** — Apache-2.0.
- **`weights/yolov8n-seg.pt`, `weights/yolov8n.pt`** — AGPL-3.0, same as ultralytics.
  No longer loaded by anything. Safe to delete.
- **`checkpoints/*_yolo_seg_best.pth`** — these are your own MobileNetV3 weights; the
  name only records that their *training images* were cropped using YOLOv8. Running a
  program over your data does not make the output a derivative work of that program,
  so these are yours. Retraining the crops with GrabCut or SAM would remove even the
  historical link, if you want the provenance to be clean end to end.
- **OpenCLIP** — MIT code. This project pins `ViT-B-32 / laion2b_s34b_b79k`,
  trained by LAION on LAION-2B and openly released; the checkpoint is used
  frozen, for embeddings only, and is never fine-tuned or redistributed here.

## Datasets

Images were scraped from the web. Scraped photographs remain under their original
copyright regardless of this project's licence. That is a redistribution question,
not a code-licence one, and it is why `datasets/` is gitignored. Resolve it before
publishing the dataset or any model trained on it commercially.
