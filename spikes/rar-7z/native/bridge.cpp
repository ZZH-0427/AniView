// Research-only native binding. Indexed metadata/selection; no CLI or archive
// paths used as output paths. All native storage is inside capped linear memory.
#include "CPP/Common/MyInitGuid.h"
#include "CPP/Common/MyCom.h"
#include "CPP/Common/StringConvert.h"
#include "CPP/Common/UTFConvert.h"
#include "CPP/Windows/PropVariant.h"
#include "CPP/7zip/Common/FileStreams.h"
#include "CPP/7zip/Archive/7z/7zHandler.h"
#include "CPP/7zip/Archive/Rar/RarHandler.h"
#include "CPP/7zip/Archive/Rar/Rar5Handler.h"
#include "CPP/7zip/IPassword.h"
#include "CPP/7zip/Common/RegisterArc.h"
#include <vector>
#include <new>
#include <cstdlib>
#include <cstring>
using NWindows::NCOM::CPropVariant;
static CMyComPtr<IInArchive> archive;
static CMyComPtr<IInStream> input;
static std::vector<Byte> output;
static UInt64 cap = 0;
// Stable numeric native outcomes; no password/path/exception text is returned.
enum { OK=0, CORRUPT=1, REQUIRED=2, REJECTED=3, LIMIT=4, METHOD=5, INTERNAL=6, PASSWORD_OR_CORRUPT=7 };
static int last = OK;
static bool supplied=false;
static bool passwordRequested=false;
static UString password;
// Direct handler construction is the only entry point. Container registrations
// in the RAR translation units are intentionally not exposed as a format factory.
void RegisterArc(const CArcInfo *) throw() {}
static HRESULT getPassword(BSTR *p) {
  passwordRequested=true;
  if (!supplied) { last=REQUIRED; return E_ABORT; }
  return StringToBstr(password,p);
}
class OpenCallback final: public IArchiveOpenCallback, public ICryptoGetTextPassword, public CMyUnknownImp {
  Z7_IFACES_IMP_UNK_2(IArchiveOpenCallback, ICryptoGetTextPassword)
};
Z7_COM7F_IMF(OpenCallback::SetTotal(const UInt64 *,const UInt64 *)){return S_OK;}
Z7_COM7F_IMF(OpenCallback::SetCompleted(const UInt64 *,const UInt64 *)){return S_OK;}
Z7_COM7F_IMF(OpenCallback::CryptoGetTextPassword(BSTR *p)){return getPassword(p);}
class OutputStream final: public ISequentialOutStream,public CMyUnknownImp {
public:
  Z7_IFACES_IMP_UNK_1(ISequentialOutStream)
};
Z7_COM7F_IMF(OutputStream::Write(const void *data,UInt32 size,UInt32 *processed)) {
  if(processed)*processed=0;
  if(size>cap-output.size()){last=LIMIT;return E_ABORT;}
  try{const Byte *b=(const Byte*)data;output.insert(output.end(),b,b+size);}
  catch(...){last=LIMIT;return E_OUTOFMEMORY;}
  if(processed)*processed=size;return S_OK;
}
class ExtractCallback final:public IArchiveExtractCallback,public ICryptoGetTextPassword,public CMyUnknownImp {
  Z7_IFACES_IMP_UNK_2(IArchiveExtractCallback,ICryptoGetTextPassword)
  Z7_IFACE_COM7_IMP(IProgress)
};
Z7_COM7F_IMF(ExtractCallback::SetTotal(UInt64)){return S_OK;}
Z7_COM7F_IMF(ExtractCallback::SetCompleted(const UInt64 *)){return S_OK;}
Z7_COM7F_IMF(ExtractCallback::GetStream(UInt32,ISequentialOutStream **s,Int32 mode)) {
  *s=nullptr;if(mode==NArchive::NExtract::NAskMode::kExtract){auto *p=new OutputStream;*s=p;(*s)->AddRef();}return S_OK;
}
Z7_COM7F_IMF(ExtractCallback::PrepareOperation(Int32)){return S_OK;}
Z7_COM7F_IMF(ExtractCallback::SetOperationResult(Int32 result)) {
  using namespace NArchive::NExtract::NOperationResult;
  if(result==kUnsupportedMethod)last=METHOD;
  else if(result==kWrongPassword)last=REJECTED;
  else if(result!=kOK)last=CORRUPT;
  return S_OK;
}
Z7_COM7F_IMF(ExtractCallback::CryptoGetTextPassword(BSTR *p)){return getPassword(p);}
static void setPassword(const char *p){passwordRequested=false;supplied=p!=nullptr;password.Empty();if(p)password=GetUnicodeString(p,CP_UTF8);}
extern "C" {
int av_last(){return last;}
void av_release(){std::vector<Byte>().swap(output);}
void av_close(){av_release();if(archive)archive->Close();archive.Release();input.Release();password.Empty();supplied=false;}
int av_open(int kind,const char *p){
  av_close();last=OK;setPassword(p);
  try {
    if(kind==7)archive=new NArchive::N7z::CHandler;
    else if(kind==4)archive=new NArchive::NRar::CHandler;
    else if(kind==5)archive=new NArchive::NRar5::CHandler;
    else return INTERNAL;
    auto *f=new CInFileStream;input=f;
    if(!f->Open("/input/archive"))return CORRUPT;
    CMyComPtr<IArchiveOpenCallback> callback=new OpenCallback;
    const UInt64 scan=0;
    HRESULT hr=archive->Open(input,&scan,callback);
    if(hr!=S_OK && last==OK)last=hr==E_OUTOFMEMORY?LIMIT:CORRUPT;
  }catch(const std::bad_alloc&){last=LIMIT;}catch(...){last=INTERNAL;}
  if(last==CORRUPT&&supplied&&passwordRequested)last=PASSWORD_OR_CORRUPT;
  password.Empty();supplied=false;return last;
}
int av_count(){UInt32 n=0;if(!archive||archive->GetNumberOfItems(&n)!=S_OK)return -1;return n>2147483647?-1:(int)n;}
const char *av_string(int index,int property){
  static AString text;text.Empty();CPropVariant p;
  if(archive&&archive->GetProperty(index,property,&p)==S_OK&&p.vt==VT_BSTR&&p.bstrVal)ConvertUnicodeToUTF8(p.bstrVal,text);
  return text.Ptr();
}
double av_number(int index,int property){
  CPropVariant p;if(!archive||archive->GetProperty(index,property,&p)!=S_OK)return -1;
  if(p.vt==VT_UI8)return (double)p.uhVal.QuadPart;if(p.vt==VT_UI4)return p.ulVal;if(p.vt==VT_BOOL)return p.boolVal?1:0;return -1;
}
int av_extract(int index,double maxBytes,const char *p,int streamOnly){
  av_release();last=OK;setPassword(p);cap=(UInt64)maxBytes;
  try{
    CPropVariant size;archive->GetProperty(index,kpidSize,&size);
    if(!streamOnly&&size.vt==VT_UI8){if(size.uhVal.QuadPart>cap){last=LIMIT;}else output.reserve((size_t)size.uhVal.QuadPart);}
    if(last==OK){CMyComPtr<IArchiveExtractCallback> cb=new ExtractCallback;const UInt32 id=index;HRESULT hr=archive->Extract(&id,1,false,cb);if(hr!=S_OK&&last==OK)last=hr==E_OUTOFMEMORY?LIMIT:CORRUPT;}
  }catch(const std::bad_alloc&){last=LIMIT;}catch(...){last=INTERNAL;}
  if(last==CORRUPT&&supplied&&passwordRequested)last=PASSWORD_OR_CORRUPT;
  password.Empty();supplied=false;if(last!=OK)av_release();return last;
}
const void *av_output(){return output.data();}
int av_length(){return (int)output.size();}
int av_probe_alloc(int bytes){void *(*volatile allocate)(size_t)=malloc;void *p=allocate(bytes);if(!p)return 0;((volatile Byte*)p)[0]=17;((volatile Byte*)p)[bytes-1]=18;free(p);return 1;}
}
