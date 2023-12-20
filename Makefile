WASI_SDK_PATH ?= /opt/wasi-sdk-15.0
WASI_LIBCLANG_RT_PATH ?= $(shell echo "$(WASI_SDK_PATH)/lib/clang"/*/lib/wasi/libclang_rt.builtins-wasm32.a)
CC = "${WASI_SDK_PATH}/bin/clang"
LD = "${WASI_SDK_PATH}/bin/wasm-ld"

CFLAGS = -x c -Os -flto --target=wasm32 --sysroot=${WASI_SDK_PATH}/share/wasi-sysroot -D__wasi_api_h '-DEXPORT=__attribute__((visibility("default")))'
LDFLAGS = -O9 -m wasm32 -L$(WASI_SDK_PATH)/share/wasi-sysroot/lib/wasm32-wasi --no-entry -lc -lm --export-dynamic "$(WASI_LIBCLANG_RT_PATH)"

SQLITE_FLAGS = \
	-DSQLITE_DEFAULT_MEMSTATUS=0 \
	-DSQLITE_DQS=0 \
	-DSQLITE_ENABLE_FTS5 \
	-DSQLITE_ENABLE_MATH_FUNCTIONS \
	-DSQLITE_LIKE_DOESNT_MATCH_BLOBS \
	-DSQLITE_MAX_EXPR_DEPTH=0 \
	-DSQLITE_MAX_MMAP_SIZE=0 \
	-DSQLITE_OMIT_AUTOINIT \
	-DSQLITE_OMIT_DEPRECATED \
	-DSQLITE_OMIT_LOAD_EXTENSION \
	-DSQLITE_OMIT_PROGRESS_CALLBACK \
	-DSQLITE_OMIT_SHARED_CACHE \
	-DSQLITE_OMIT_UTF16 \
	-DSQLITE_OS_OTHER=1 \
	-DSQLITE_THREADSAFE=0

.PHONY: all clean update

all: sqlite/sqlite3.wasm

update:
	./scripts/update-sqlite.sh

sqlite/sqlite3.o: sqlite/sqlite3.c sqlite/sqlite3.h
	$(CC) $(CFLAGS) $(SQLITE_FLAGS) \
		'-DSQLITE_API=__attribute__((visibility("default")))' \
		-c sqlite/sqlite3.c \
		-o sqlite/sqlite3.o

sqlite/sqlite3wasm.o: sqlite/sqlite3wasm.c sqlite/sqlite3wasm.h sqlite/sqlite3.h
	$(CC) $(CFLAGS) $(SQLITE_FLAGS) \
		'-DSQLITE_API=__attribute__((visibility("default")))' \
		'-DSQLITE_EXTRA_API=__attribute__((visibility("default")))' \
		-c sqlite/sqlite3wasm.c \
		-o sqlite/sqlite3wasm.o

sqlite/sqlite3.wasm: sqlite/sqlite3.o sqlite/sqlite3wasm.o
	$(LD) $(LDFLAGS) -o $@ sqlite/sqlite3.o sqlite/sqlite3wasm.o

clean:
	rm -f sqlite/*.o
	rm -f sqlite/*.wasm
