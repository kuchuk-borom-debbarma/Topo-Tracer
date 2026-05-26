#!/bin/bash

SKILL_NAME="backend-project-structure-skill"
INSTALL_PATH="$HOME/.gemini/skills/$SKILL_NAME"

echo "Installing $SKILL_NAME..."

# Detect platform and set paths
if [[ -d "$HOME/.claude" ]]; then
    PLATFORM="Claude Code"
    INSTALL_BASE="$HOME/.claude/skills"
elif [[ -d "$HOME/.gemini" ]]; then
    PLATFORM="Gemini CLI"
    INSTALL_BASE="$HOME/.gemini/skills"
else
    PLATFORM="Universal"
    INSTALL_BASE="$HOME/.agents/skills"
fi

INSTALL_PATH="$INSTALL_BASE/$SKILL_NAME"

mkdir -p "$INSTALL_BASE"
cp -R "$(dirname "$0")" "$INSTALL_PATH"

echo "Successfully installed to $PLATFORM ($INSTALL_PATH)"
echo ""
echo "To use it, restart your session and type:"
echo "  /backend-project-structure scaffold MyService"
