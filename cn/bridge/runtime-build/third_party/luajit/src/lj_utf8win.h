#ifndef LJ_UTF8_WIN_H
#define LJ_UTF8_WIN_H

#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>

#ifdef _WIN32
bool _lua_narrowtobuffer(wchar_t const* srcPtr, char* dstBuf, int dstSize);
bool _lua_widentobuffer(char const* srcPtr, wchar_t* dstBuf, int dstSize);
FILE* _lua_fopen(char const* path, char const* mode);
char const* _lua_getenvcopy(char const* name);
void _lua_getenvfree(char const* name);
int _lua_remove(char const* path);
int _lua_rename(char const* oldpath, char const* newpath);
int _lua_system(char const* cmd);
char* _lua_tmpnam();
#else
#define _lua_fopen(path, mode) fopen(path, mode)
#define _lua_getenvcopy(name) strdup(getenv(name))
#define _lua_getenvfree(name) free(name)
#define _lua_remove(path) remove(path)
#define _lua_rename(oldpath, newpath) rename(oldpath, newpath)
#define _lua_system(cmd) system(cmd)
#define _lua_tmpnam(s) tmpnam(s)
#endif

#endif
