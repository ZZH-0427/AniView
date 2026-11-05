"""Synthetic compressed-header allocation probe; no media or native source."""
import lzma
import struct
import zlib
from pathlib import Path


def uint(value):
    for extra in range(8):
        if value < 2 ** (7 + 7 * extra):
            return bytes([((0xff << (8 - extra)) & 255) | (value >> (8 * extra))]) + value.to_bytes(8, 'little')[:extra]
    return b'\xff' + value.to_bytes(8, 'little')


# An oversized archive property makes the encoded header highly compressible.
# The header's declared unpacked size exceeds the compiled 64 MiB maximum.
raw = b'\x01\x02\x80' + uint(80 * 1024**2) + bytes(80 * 1024**2) + b'\x00\x00'
packed = lzma.compress(raw, format=lzma.FORMAT_RAW, filters=[{'id': lzma.FILTER_LZMA2, 'dict_size': 1024**2}])
encoded = b'\x17\x06\x00\x01\x09' + uint(len(packed)) + b'\x00\x07\x0b\x01\x00\x01\x21\x21\x01\x10\x0c' + uint(len(raw)) + b'\x00\x00'
start = struct.pack('<QQI', len(packed), len(encoded), zlib.crc32(encoded))
archive = b'7z\xbc\xaf\x27\x1c\x00\x04' + struct.pack('<I', zlib.crc32(start)) + start + packed + encoded
Path('.tools/m10c2/fixtures/header-over-cap.7z').write_bytes(archive)
print({'archiveBytes': len(archive), 'declaredHeaderBytes': len(raw)})
