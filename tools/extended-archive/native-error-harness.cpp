// Developer-only, controlled stream tests. This does not read or create archives.
// Including the actual translation unit exposes its two static PPM callbacks
// without adding hooks to the distributed native component.
#include "CPP/Common/MyInitGuid.h"
#include "CPP/7zip/Compress/Rar3Decoder.cpp"

#include <cstdio>
#include <cstring>

using NCompress::NRar3::CByteIn;
using NCompress::NRar3::CDecoder;
using NCompress::NRar3::Wrap_ReadBits8;
using NCompress::NRar3::Wrap_ReadByte;

namespace {

unsigned failures = 0;
unsigned cases = 0;

void Check(bool ok, const char *name)
{
  ++cases;
  if (!ok)
    ++failures;
  std::printf("{\"name\":\"%s\",\"passed\":%s}\n", name, ok ? "true" : "false");
}

// The streams obey ISequentialInStream: bounded writes, processedSize always
// assigned, and HRESULT errors returned rather than exceptions thrown across COM.
class ControlledStream final: public ISequentialInStream
{
public:
  const Byte *payload = NULL;
  UInt32 length = 0;
  UInt32 position = 0;
  unsigned reads = 0;
  HRESULT endResult = S_OK;
  CDecoder *observeDecoder = NULL;
  HRESULT capturedResult = S_OK;
  bool sawInitializedResult = false;

  void Reset(const Byte *data, UInt32 size, HRESULT result)
  {
    payload = data;
    length = size;
    position = 0;
    reads = 0;
    endResult = result;
  }

  STDMETHOD(QueryInterface)(REFIID, void **out) throw() override
  {
    *out = NULL;
    return E_NOINTERFACE;
  }
  STDMETHOD_(ULONG, AddRef)() throw() override { return 1; }
  STDMETHOD_(ULONG, Release)() throw() override { return 1; }

  STDMETHOD(Read)(void *data, UInt32 size, UInt32 *processed) throw() override
  {
    ++reads;
    *processed = 0;
    if (observeDecoder && reads == 1)
    {
      // White-box seam: Code must first clear a stale captured HRESULT. Inject
      // only the status that the separately tested real callbacks would save.
      // -fno-access-control is confined to this test TU; layout is unchanged.
      sawInitializedResult = observeDecoder->m_InBitStream.hresult == S_OK;
      observeDecoder->m_InBitStream.hresult = capturedResult;
    }
    if (size == 0)
      return S_OK;
    const UInt32 remaining = length - position;
    if (remaining == 0)
      return endResult;
    const UInt32 count = remaining < size ? remaining : size;
    std::memcpy(data, payload + position, count);
    position += count;
    *processed = count;
    return S_OK;
  }
};

class EmptyOutput final: public ISequentialOutStream
{
public:
  unsigned writes = 0;
  STDMETHOD(QueryInterface)(REFIID, void **out) throw() override
  {
    *out = NULL;
    return E_NOINTERFACE;
  }
  STDMETHOD_(ULONG, AddRef)() throw() override { return 1; }
  STDMETHOD_(ULONG, Release)() throw() override { return 1; }
  STDMETHOD(Write)(const void *, UInt32 size, UInt32 *processed) throw() override
  {
    ++writes;
    *processed = size;
    return S_OK;
  }
};

void TestCallbacks()
{
  const HRESULT results[] = { E_FAIL, E_ABORT, S_FALSE };
  for (unsigned callback = 0; callback < 2; ++callback)
  {
    for (unsigned error = 0; error < sizeof(results) / sizeof(results[0]); ++error)
    {
      CByteIn reader;
      ControlledStream input;
      input.Reset(NULL, 0, results[error]);
      const bool created = reader.BitDecoder.Create(4);
      reader.BitDecoder.SetStream(&input);
      reader.hresult = E_OUTOFMEMORY;
      reader.Init();
      reader.IByteIn_obj.Read = callback == 0 ? Wrap_ReadByte : Wrap_ReadBits8;
      bool ok = created && reader.hresult == S_OK;
      const Byte first = IByteIn_Read(&reader.IByteIn_obj);
      ok = ok && first == 0xFF && reader.hresult == results[error]
          && reader.BitDecoder.Stream.WasFinished()
          && reader.BitDecoder.Stream.NumExtraBytes == 1 && input.reads == 1;
      const Byte second = IByteIn_Read(&reader.IByteIn_obj);
      ok = ok && second == 0xFF && reader.hresult == results[error]
          && reader.BitDecoder.Stream.NumExtraBytes == 2 && input.reads == 1;
      char name[96];
      std::snprintf(name, sizeof(name), "%s-captures-hresult-%u-and-stops-refill",
          callback == 0 ? "read-byte" : "read-aligned-byte", error);
      Check(ok, name);

      const Byte payload[] = { 0x12, 0x34 };
      input.Reset(payload, sizeof(payload), S_OK);
      reader.Init();
      ok = reader.hresult == S_OK && !reader.BitDecoder.Stream.WasFinished()
          && reader.BitDecoder.Stream.NumExtraBytes == 0;
      if (callback != 0)
        ok = ok && reader.BitDecoder.GetValue(16) == 0x1234;
      const Byte a = IByteIn_Read(&reader.IByteIn_obj);
      const Byte b = IByteIn_Read(&reader.IByteIn_obj);
      const Byte eof = IByteIn_Read(&reader.IByteIn_obj);
      const Byte eofAgain = IByteIn_Read(&reader.IByteIn_obj);
      ok = ok && a == 0x12 && b == 0x34 && eof == 0xFF && eofAgain == 0xFF
          && reader.hresult == S_OK && input.reads == 2
          && reader.BitDecoder.Stream.NumExtraBytes == 2;
      std::snprintf(name, sizeof(name), "%s-init-recovery-and-normal-eof-%u",
          callback == 0 ? "read-byte" : "read-aligned-byte", error);
      Check(ok, name);
    }
  }
}

void TestSharedBuffer()
{
  const Byte payload[] = { 0x28, 0x73 };
  ControlledStream input;
  input.Reset(payload, sizeof(payload), E_FAIL);
  CInBuffer reader;
  bool ok = reader.Create(4);
  reader.SetStream(&input);
  reader.Init();
  const Byte first = reader.ReadByte();
  const Byte second = reader.ReadByte();
  HRESULT caught = S_OK;
  try { reader.ReadByte(); }
  catch (const CInBufferException &e) { caught = e.ErrorCode; }
  catch (...) { caught = E_INVALIDARG; }
  ok = ok && first == payload[0] && second == payload[1] && caught == E_FAIL
      && reader.WasFinished() && input.reads == 2 && reader.GetStreamSize() == 2;
  Check(ok, "shared-buffer-throws-original-hresult-after-buffered-input");

  Byte byte = 0;
  Byte destination[4] = {};
  size_t available = 100;
  bool noRefill = !reader.ReadByte(byte) && byte == 0xFF
      && reader.NumExtraBytes == 0;
  reader.Lookahead(available);
  noRefill = noRefill && available == 0
      && reader.ReadBytesPart(destination, sizeof(destination)) == 0
      && reader.ReadBytes(destination, sizeof(destination)) == 0
      && reader.Skip(sizeof(destination)) == 0 && reader.ReadByte() == 0xFF
      && reader.NumExtraBytes == 1 && input.reads == 2;
  Check(noRefill, "failed-input-read-byte-lookahead-read-bytes-skip-never-refill");

  input.Reset(payload, sizeof(payload), S_OK);
  reader.Init();
  ok = !reader.WasFinished() && reader.NumExtraBytes == 0
      && reader.ReadBytes(destination, sizeof(destination)) == sizeof(payload)
      && std::memcmp(destination, payload, sizeof(payload)) == 0
      && reader.WasFinished() && reader.GetStreamSize() == sizeof(payload)
      && reader.ReadByte() == 0xFF && input.reads == 2;
  Check(ok, "shared-buffer-init-recovery-normal-eof-and-processed-size");
}

void TestCodeStatus()
{
  // A single zero byte selects the LZ table branch; its ordinary EOF rejects an
  // incomplete table with S_FALSE. It cannot enter PPM allocation/VM/output.
  // This is a unit stream, not a container or a vulnerability-triggering sample.
  const Byte selectLz[] = { 0 };
  const HRESULT results[] = { E_FAIL, E_ABORT, S_FALSE, S_OK };
  CDecoder decoder;
  EmptyOutput output;
  const UInt64 inSize = sizeof(selectLz);
  const UInt64 outSize = 0;
  for (unsigned index = 0; index < sizeof(results) / sizeof(results[0]); ++index)
  {
    ControlledStream input;
    input.Reset(selectLz, sizeof(selectLz), S_OK);
    input.observeDecoder = &decoder;
    input.capturedResult = results[index];
    decoder.m_InBitStream.hresult = E_OUTOFMEMORY;
    const HRESULT actual = decoder.Code(&input, &output, &inSize, &outSize, NULL);
    const HRESULT expected = results[index] == S_OK ? S_FALSE : results[index];
    const bool ok = input.sawInitializedResult && actual == expected
        && decoder.m_InBitStream.hresult == results[index] && input.reads == 2
        && output.writes == 0 && !Ppmd7_WasAllocated(&decoder._ppmd)
        && decoder._lzMode && !decoder._solidAllowed;
    char name[96];
    std::snprintf(name, sizeof(name), "code-clears-stale-status-and-propagates-captured-hresult-%u", index);
    Check(ok, name);
  }

  const Byte solid = 1;
  ControlledStream input;
  input.Reset(NULL, 0, S_OK);
  const bool propertySet = decoder.SetDecoderProperties2(&solid, 1) == S_OK;
  const HRESULT result = decoder.Code(&input, &output, &inSize, &outSize, NULL);
  Check(propertySet && result == S_FALSE && input.reads == 0,
      "failed-code-does-not-admit-solid-continuation");
}

} // namespace

int main()
{
  TestCallbacks();
  TestSharedBuffer();
  TestCodeStatus();
  std::printf("{\"summary\":true,\"cases\":%u,\"failed\":%u}\n", cases, failures);
  return failures == 0 ? 0 : 1;
}
