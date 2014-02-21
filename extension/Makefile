RUNTIME_SRC = \
  ./third_party/traceur-compiler/src/runtime/runtime.js \
  ./third_party/traceur-compiler/src/runtime/url.js \
  ./third_party/traceur-compiler/src/runtime/ModuleStore.js

all: compiled/traceFunctionsPreprocessor.js compiled/fakeMakerCompiler.js

compiled/%:  lib/%
	./third_party/traceur-compiler/traceur --sourcemap --out $@ $(foreach src,$(RUNTIME_SRC),--script $(src)) $^

clean:
	rm -f compiled/*
