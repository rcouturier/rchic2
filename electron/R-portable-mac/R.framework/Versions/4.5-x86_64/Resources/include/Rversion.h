/* Rversion.h.  Generated automatically. */
#ifndef R_VERSION_H
#define R_VERSION_H

#ifdef __cplusplus
extern "C" {
#endif

#define R_VERSION 263426
#define R_NICK "[Not] Part in a Rumble"
#define R_Version(v,p,s) (((v) * 65536) + ((p) * 256) + (s))
#define R_MAJOR  "4"
#define R_MINOR  "5.2"
#define R_STATUS ""
#define R_YEAR   "2025"
#define R_MONTH  "10"
#define R_DAY    "31"
#define R_SVN_REVISION 88974
#ifdef __llvm__
# define R_FILEVERSION    4,52,23438,0
#else
# define R_FILEVERSION    4,52,88974,0
#endif

#ifdef __cplusplus
}
#endif

#endif /* not R_VERSION_H */
