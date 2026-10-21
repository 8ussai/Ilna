import io
import os
import uuid
from dataclasses import dataclass
from typing import BinaryIO

from PIL import Image, ImageOps, ImageSequence

from backend.backendConfig import (
    MAX_POST_IMAGE_BYTES,
    POST_IMAGE_DIR,
    POST_IMAGE_MAX_FRAMES,
    POST_IMAGE_MAX_PIXELS,
    POST_IMAGE_MAX_SIDE,
    POST_IMAGE_MAX_TOTAL_PIXELS,
)

# what a post picture may be, judged from the file's contents rather than its name
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
# a GIF frame with no delay of its own shows this long, as browsers do
DEFAULT_FRAME_MS = 100


class ImageRejected(ValueError):
    """The upload isn't a picture we accept; the message is shown to the user."""


@dataclass
class ProcessedImage:
    data: bytes
    width: int
    height: int
    is_animated: bool


def read_upload(file: BinaryIO) -> bytes:
    """The uploaded file, refusing one over MAX_POST_IMAGE_BYTES without reading it all."""
    data = file.read(MAX_POST_IMAGE_BYTES + 1)
    if len(data) > MAX_POST_IMAGE_BYTES:
        raise ImageRejected(f"Pictures can be up to {MAX_POST_IMAGE_BYTES // 1024 ** 2} MB each.")
    return data


def process_image(raw: bytes) -> ProcessedImage:
    """Checks the upload is a real picture, then re-encodes it as WebP no bigger than POST_IMAGE_MAX_SIDE.
    Re-encoding keeps only the pixels, so EXIF data (GPS location, camera, time) is never saved.
    Animated GIFs stay animated."""
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(raw))
        if image.format not in ALLOWED_FORMATS:
            raise ImageRejected("Pictures must be JPG, PNG, WebP or GIF.")

        width, height = image.size
        if width * height > POST_IMAGE_MAX_PIXELS:
            raise ImageRejected("This picture is too large.")

        if getattr(image, "is_animated", False) and getattr(image, "n_frames", 1) > 1:
            return _animated(image, width * height)
        return _still(image)
    except ImageRejected:
        raise
    except Exception:
        # not a picture, a broken one, or one that would unpack to something enormous
        raise ImageRejected("This file isn't a picture we can use.")


def _still(image: Image.Image) -> ProcessedImage:
    # phone photos are often stored sideways with a "rotate me" note; apply it before the note is dropped
    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    image = image.convert("RGBA" if has_alpha else "RGB")
    image.thumbnail((POST_IMAGE_MAX_SIDE, POST_IMAGE_MAX_SIDE))
    out = io.BytesIO()
    image.save(out, "WEBP", quality=82, method=4)
    return ProcessedImage(out.getvalue(), image.width, image.height, is_animated=False)


def _animated(image: Image.Image, frame_pixels: int) -> ProcessedImage:
    frame_count = image.n_frames
    if frame_count > POST_IMAGE_MAX_FRAMES or frame_pixels * frame_count > POST_IMAGE_MAX_TOTAL_PIXELS:
        raise ImageRejected("This animation is too long or too large.")

    frames, durations = [], []
    for frame in ImageSequence.Iterator(image):
        copy = frame.convert("RGBA")
        copy.thumbnail((POST_IMAGE_MAX_SIDE, POST_IMAGE_MAX_SIDE))
        frames.append(copy)
        durations.append(frame.info.get("duration") or DEFAULT_FRAME_MS)

    out = io.BytesIO()
    frames[0].save(
        out, "WEBP", save_all=True, append_images=frames[1:],
        duration=durations, loop=image.info.get("loop", 0), quality=80, method=4,
    )
    return ProcessedImage(out.getvalue(), frames[0].width, frames[0].height, is_animated=True)


def save_image(processed: ProcessedImage) -> str:
    """Writes the picture under a random name and returns its path."""
    path = f"{POST_IMAGE_DIR}/{uuid.uuid4().hex}.webp"
    with open(path, "wb") as f:
        f.write(processed.data)
    return path


def remove_image_files(paths: list[str]) -> None:
    """Call after the commit, so a failed delete never leaves rows pointing at missing files."""
    for path in paths:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
