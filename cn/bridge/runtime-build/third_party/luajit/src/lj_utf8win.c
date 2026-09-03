#include "lj_utf8win.h"

#ifdef _WIN32
#include <Windows.h>
#include <stdbool.h>
#include <stdio.h>
#include <wchar.h>

enum { PathBufSize = 1<<16, ModeBufSize = 5 };

bool _lua_narrowtobuffer(wchar_t const* srcPtr, char* dstBuf, int dstSize)
{
  int cchSrc = (int)wcslen(srcPtr);
  if (!cchSrc) {
    dstBuf[0] = '\0';
    return true;
  }
  int cbDst = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, srcPtr, cchSrc, dstBuf, dstSize - 1, NULL, NULL);
  if (!cbDst || cbDst >= dstSize) {
    return false;
  }
  dstBuf[cbDst] = '\0';
  return true;
}

bool _lua_widentobuffer(char const* srcPtr, wchar_t* dstBuf, int dstSize)
{
  int cbSrc = (int)strlen(srcPtr);
  if (!cbSrc) {
    dstBuf[0] = L'\0';
    return true;
  }
  int cchDst = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, srcPtr, cbSrc, dstBuf, dstSize - 1);
  if (!cchDst || cchDst >= dstSize ) {
    return false;
  }
  dstBuf[cchDst] = L'\0';
  return true;
}

FILE* _lua_fopen(char const* path, char const* mode)
{
  if (!path || !mode) {
    return NULL;
  }
  wchar_t pathBuf[PathBufSize];
  wchar_t modeBuf[ModeBufSize];
  if (!_lua_widentobuffer(path, pathBuf, PathBufSize) ||
      !_lua_widentobuffer(mode, modeBuf, ModeBufSize))
  {
    return NULL;
  }
  FILE* fp = _wfopen(pathBuf, modeBuf);
  return fp;
}

char const* _lua_getenvcopy(char const* name)
{
  if (!name) {
    return NULL;
  }
  wchar_t nameBuf[PathBufSize];
  if (!_lua_widentobuffer(name, nameBuf, PathBufSize)) {
    return NULL;
  }
  wchar_t* var = _wgetenv(nameBuf);
  if (!var) {
    return NULL;
  }
  char varBuf[PathBufSize];
  if (!_lua_narrowtobuffer(var, varBuf, PathBufSize)) {
    return NULL;
  }
  size_t cbVar = strlen(varBuf) + 1;
  char* ret = calloc(1, cbVar);
  memcpy(ret, varBuf, cbVar);
  return ret;
}

void _lua_getenvfree(char const* var)
{
  if (var) {
    free((char*)var);
  }
}

int _lua_remove(char const* path)
{
  if (!path) {
    return -1;
  }
  wchar_t pathBuf[PathBufSize];
  if (!_lua_widentobuffer(path, pathBuf, PathBufSize)) {
        return -1;
  }
  return _wremove(pathBuf);
}

int _lua_rename(char const* oldpath, char const* newpath)
{
  if (!oldpath || !newpath) {
    return -1;
  }
  wchar_t oldBuf[PathBufSize];
  wchar_t newBuf[PathBufSize];
  if (!_lua_widentobuffer(oldpath, oldBuf, PathBufSize) ||
      !_lua_widentobuffer(newpath, newBuf, PathBufSize))
  {
    return -1;
  }
  return _wrename(oldBuf, newBuf);
}

int _lua_system(char const* cmd)
{
  if (!cmd) {
    return -1;
  }
  wchar_t cmdBuf[PathBufSize];
  if (!_lua_widentobuffer(cmd, cmdBuf, PathBufSize)) {
    return -1;
  }
  return _wsystem(cmdBuf);
}

char* _lua_tmpnam(char* s)
{
  wchar_t tmpBuf[L_tmpnam];
  _wtmpnam(tmpBuf);

  if (!_lua_narrowtobuffer(tmpBuf, s, L_tmpnam)) {
    return NULL;
  }
  return s;
}

#endif
