"""Optional isolated Windows toolchain bootstrap. Does not change global PATH."""
import hashlib
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.tools'
SDK_COMMIT = '35659964bc2762fffec0d257997fb61475f765b7'
SDK_SHA256 = '1965569d3c03bf86d66d4abd6ffdfabca994301c8361ba9233f47454b16cf9d4'


def main():
    archive = TOOLS / 'downloads' / 'emsdk.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        urllib.request.urlretrieve(f'https://codeload.github.com/emscripten-core/emsdk/zip/{SDK_COMMIT}', archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SDK_SHA256:
        raise RuntimeError('Emsdk archive SHA256 mismatch')
    sdk = TOOLS / 'emsdk'
    with zipfile.ZipFile(archive) as data:
        prefix = data.namelist()[0].split('/')[0] + '/'
        for entry in data.infolist():
            name = entry.filename.removeprefix(prefix)
            if not name:
                continue
            destination = (sdk / name).resolve()
            destination.relative_to(sdk.resolve())
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data.read(entry))
    for operation in ['install', 'activate']:
        subprocess.run([sys.executable, str(sdk / 'emsdk.py'), operation, '6.0.13'], check=True)
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--upgrade', '--target', str(TOOLS / 'python-build'),
                    'cmake==4.4.4', 'ninja==1.13.2'], check=True)


if __name__ == '__main__':
    main()
