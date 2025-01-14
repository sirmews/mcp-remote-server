# Colors for better visibility
CYAN := \033[36m
GREEN := \033[32m
RED := \033[31m
RESET := \033[0m


# Default make command
all: help

## inspect-local-server: Inspect the local MCP server
inspect-local-server:
	npx @modelcontextprotocol/inspector bun ./build/index.js

## build: Build the project
build:
	bun build ./index.ts --outdir ./build --target node

## help: Show a list of commands
help : Makefile
	@echo "Usage:"
	@echo "  make $(CYAN)<target>$(RESET)"
	@echo ""
	@echo "Targets:"
	@awk '/^[a-zA-Z\-_0-9%:\\]+/ { \
		helpMessage = match(lastLine, /^## (.*)/); \
		if (helpMessage) { \
			helpCommand = $$1; \
			helpMessage = substr(lastLine, RSTART + 3, RLENGTH); \
			gsub("\\\\", "", helpCommand); \
			gsub(":+$$", "", helpCommand); \
			printf "  $(CYAN)%-20s$(RESET) %s\n", helpCommand, helpMessage; \
		} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)


.PHONY: all help