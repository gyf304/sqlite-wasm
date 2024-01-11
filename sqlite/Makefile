WASI_SDK_PATH ?= /opt/wasi-sdk-15.0
WASI_LIBCLANG_RT_PATH ?= $(shell echo "$(WASI_SDK_PATH)/lib/clang"/*/lib/wasi/libclang_rt.builtins-wasm32.a)
CC = "${WASI_SDK_PATH}/bin/clang"
LD = "${WASI_SDK_PATH}/bin/wasm-ld"

CFLAGS = -x c -Os -flto --target=wasm32 --sysroot=${WASI_SDK_PATH}/share/wasi-sysroot \
	-D__wasi_api_h '-DEXPORT=__attribute__((visibility("default")))' \
	-Wpoison-system-directories -Wall -Wno-unused-variable -Werror \
	-Isqlite

LDFLAGS = -m wasm32 -L$(WASI_SDK_PATH)/share/wasi-sysroot/lib/wasm32-wasi --no-entry -lc -lm \
	--export-dynamic "$(WASI_LIBCLANG_RT_PATH)"

SQLITE_EXTENSIONS = $(patsubst %.c,%.wasm,$(wildcard exts/*.c))

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
	-DSQLITE_OMIT_PROGRESS_CALLBACK \
	-DSQLITE_OMIT_SHARED_CACHE \
	-DSQLITE_OMIT_UTF16 \
	-DSQLITE_OS_OTHER=1 \
	-DSQLITE_THREADSAFE=0

.PHONY: all clean update

all: sqlite3.wasm $(SQLITE_EXTENSIONS)

update:
	../scripts/update-sqlite.sh

sqlite3.h:
	../scripts/update-sqlite.sh

sqlite3ext.h:
	../scripts/update-sqlite.sh

sqlite3.c:
	../scripts/update-sqlite.sh

sqlite3wasm.o: sqlite3wasm.c sqlite3.c sqlite3wasm.h sqlite3.h
	$(CC) $(CFLAGS) $(SQLITE_FLAGS) \
		'-DSQLITE_API=__attribute__((visibility("default")))' \
		'-DSQLITE_EXTRA_API=__attribute__((visibility("default")))' \
		-c sqlite3wasm.c \
		-o sqlite3wasm.o

sqlite3.wasm: sqlite3wasm.o
	$(LD) $(LDFLAGS) --export-table -o $@ $^

exts/%.wasm: exts/%.o
	$(LD) $(LDFLAGS) --import-table --import-memory -o $@ $^

exts/%.o: exts/%.c sqlite3.h sqlite3ext.h
	$(CC) $(CFLAGS) \
		$(SQLITE_FLAGS) \
		-fvisibility=default \
		-c $< \
		-o $@

clean:
	rm -f *.o
	rm -f *.wasm
	rm -f exts/*.o
	rm -f exts/*.wasm
