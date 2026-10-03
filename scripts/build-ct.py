"""Build the board's CT volume from a DICOM series.

Source: The Cancer Imaging Archive, Soft-tissue-Sarcoma collection (CC BY 3.0),
https://doi.org/10.7937/K9/TCIA.2015.7GO2GSKS, patient STS_006, series "CT IMAGES - LEGS - RESEARCH".
De-identified by TCIA. Used as a sample study; it is not an Operon patient's scan.

    python scripts/build-ct.py <folder of .dcm files> web/public/ct

Writes volume.bin.gz (uint8, slice-major: [slice][row][col]) and meta.json. Hounsfield units are
packed into one byte with more precision where soft tissue and contrast live, so the board can
re-window it (soft tissue, bone, wide) without a 16-bit download.
"""
import gzip, json, sys
from pathlib import Path

import numpy as np
import pydicom
from scipy import ndimage

# Piecewise HU -> byte. Each segment: (HU from, HU to, byte from, byte to).
SEGMENTS = [(-1000, -150, 0, 31), (-150, 250, 32, 191), (250, 1750, 192, 255)]


def encode(hu: np.ndarray) -> np.ndarray:
    out = np.zeros(hu.shape, np.uint8)
    hu = np.clip(hu, SEGMENTS[0][0], SEGMENTS[-1][1])
    for h0, h1, b0, b1 in SEGMENTS:
        m = (hu >= h0) & (hu <= h1)
        out[m] = np.round(b0 + (hu[m] - h0) * (b1 - b0) / (h1 - h0)).astype(np.uint8)
    return out


def main(src: str, dst: str) -> None:
    files = [pydicom.dcmread(p) for p in Path(src).glob("*.dcm")]
    files = [d for d in files if "PixelData" in d]
    files.sort(key=lambda d: -float(d.ImagePositionPatient[2]))  # head end first
    first = files[0]
    iop = [round(float(x)) for x in first.ImageOrientationPatient]
    hu = np.stack([d.pixel_array.astype(np.float32) * float(d.RescaleSlope) + float(d.RescaleIntercept) for d in files])
    # Radiological display: patient's right on the viewer's left (+x is the patient's left in DICOM).
    if iop[0] < 0:
        hu = hu[:, :, ::-1]
    if iop[4] < 0:  # rows should run front (anterior) to back
        hu = hu[:, ::-1, :]

    # Halve the in-plane resolution (2x2 mean): ~2 mm pixels, plenty for a wall screen.
    s, r, c = hu.shape
    hu = hu[:, : r // 2 * 2, : c // 2 * 2].reshape(s, r // 2, 2, c // 2, 2).mean(axis=(2, 4))

    # Keep only the body in each slice: the large connected regions denser than fat, filled in.
    # The scanner table (a thin curve under the legs) is a small region and becomes air.
    for k in range(hu.shape[0]):
        lab, n = ndimage.label(ndimage.binary_opening(hu[k] > -500, iterations=2))
        if n:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, a in enumerate(sizes) if a >= 600])
            keep = ndimage.binary_fill_holes(ndimage.binary_dilation(keep, iterations=2))
        else:
            keep = np.zeros(hu[k].shape, bool)
        hu[k][~keep] = -1000

    # Crop to the body plus a margin, across all slices.
    body = (hu > -500).any(axis=0)
    rows, cols = np.where(body)
    m = 6
    r0, r1 = max(rows.min() - m, 0), min(rows.max() + m + 1, hu.shape[1])
    c0, c1 = max(cols.min() - m, 0), min(cols.max() + m + 1, hu.shape[2])
    hu = hu[:, r0:r1, c0:c1]

    vol = encode(hu)
    out = Path(dst)
    out.mkdir(parents=True, exist_ok=True)
    with gzip.open(out / "volume.bin.gz", "wb", compresslevel=9) as f:
        f.write(np.ascontiguousarray(vol).tobytes())

    px = float(first.PixelSpacing[0]) * 2
    z = abs(float(files[0].ImagePositionPatient[2]) - float(files[1].ImagePositionPatient[2]))
    meta = {
        "slices": vol.shape[0], "rows": vol.shape[1], "cols": vol.shape[2],
        "spacing": {"x": round(px, 3), "y": round(px, 3), "z": round(z, 3)},
        "encoding": [list(s) for s in SEGMENTS],
        "source": "The Cancer Imaging Archive · Soft-tissue-Sarcoma (STS_006) · CC BY 3.0",
        "doi": "https://doi.org/10.7937/K9/TCIA.2015.7GO2GSKS",
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta), f"{(out / 'volume.bin.gz').stat().st_size / 1e6:.1f} MB gz, {vol.nbytes / 1e6:.1f} MB raw")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
