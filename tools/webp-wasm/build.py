"""Rare codec rebuild; never invoked by npm ci/build. Python 3 stdlib only."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.tools'
COMMIT = '4fa21912338357f89e4fd51cf2368325b59e9bd9'
ARCHIVE_SHA256 = 'a1e18776b2bfdf59db4089cefb7453d3207bb6e77c24d649e0757e3a08fdca14'
EMSCRIPTEN = '6.0.13'


def run(args, env):
    subprocess.run([str(arg) for arg in args], env=env, check=True)


def main():
    TOOLS.mkdir(exist_ok=True)
    archive = TOOLS / 'downloads' / 'libwebp.zip'
    archive.parent.mkdir(exist_ok=True)
    if not archive.exists():
        urllib.request.urlretrieve(f'https://codeload.github.com/webmproject/libwebp/zip/{COMMIT}', archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError('Pinned libwebp archive SHA256 mismatch')
    source = TOOLS / f'libwebp-{COMMIT}'
    if not source.exists():
        with zipfile.ZipFile(archive) as data:
            prefix = data.namelist()[0].split('/')[0] + '/'
            for entry in data.infolist():
                name = entry.filename.removeprefix(prefix)
                if not name:
                    continue
                destination = (source / name).resolve()
                destination.relative_to(source.resolve())
                if entry.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data.read(entry))
    env = os.environ.copy()
    sdk = TOOLS / 'emsdk'
    em_root = sdk / 'upstream' / 'emscripten'
    local_cmake = TOOLS / 'python-build' / 'cmake' / 'data' / 'bin'
    local_ninja = TOOLS / 'python-build' / 'bin'
    env['PATH'] = os.pathsep.join([str(local_cmake), str(local_ninja), str(em_root), env['PATH']])
    if (sdk / '.emscripten').exists():
        env['EM_CONFIG'] = str(sdk / '.emscripten')
    emcc = shutil.which('emcc', path=env['PATH'])
    emcmake = shutil.which('emcmake', path=env['PATH'])
    cmake = shutil.which('cmake', path=env['PATH'])
    if not emcc or not emcmake or not cmake:
        raise RuntimeError('Install the documented local Emscripten/CMake toolchain first')
    version = subprocess.check_output([emcc, '--version'], env=env, text=True)
    if f' {EMSCRIPTEN} ' not in version.splitlines()[0]:
        raise RuntimeError(f'Expected Emscripten {EMSCRIPTEN}, got {version.splitlines()[0]}')
    build = TOOLS / 'webp-wasm-build'
    run([emcmake, cmake, '-S', ROOT / 'tools' / 'webp-wasm', '-B', build, '-G', 'Ninja',
         '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_C_FLAGS=-O2', f'-DLIBWEBP_SOURCE_DIR={source}'], env)
    run([cmake, '--build', build, '--target', 'aniview-webp', '--parallel', '4'], env)
    output = ROOT / 'src' / 'formats' / 'webp' / 'wasm'
    output.mkdir(parents=True, exist_ok=True)
    for extension in ['mjs', 'wasm']:
        path = output / f'aniview-webp.{extension}'
        shutil.copyfile(build / path.name, path)
        print(f'{path.relative_to(ROOT)}: {path.stat().st_size} bytes; SHA256 {hashlib.sha256(path.read_bytes()).hexdigest()}')
    licenses = ROOT / 'third_party' / 'licenses' / 'libwebp'
    licenses.mkdir(parents=True, exist_ok=True)
    for name in ['COPYING', 'PATENTS', 'AUTHORS']:
        shutil.copyfile(source / name, licenses / name)
    em_license = ROOT / 'third_party' / 'licenses' / 'emscripten' / 'LICENSE'
    em_license.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(em_root / 'LICENSE', em_license)
    # The public file aggregates notices for codecs, C runtime, React and build
    # helpers. A codec rebuild must not replace it with only two components.
    print('Review THIRD_PARTY_NOTICES.md and public/third-party-notices.txt after a toolchain or codec update.')


if __name__ == '__main__':
    main()
