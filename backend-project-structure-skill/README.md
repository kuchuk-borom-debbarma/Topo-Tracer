# Backend Project Structure Skill

An agent skill for scaffolding and organizing Kotlin/JVM backend projects using a contract-first, interface-driven architecture.

## Installation

### Automatic
Run the install script:
```bash
./install.sh
```

### Manual
Copy the directory to your agent's skill path:

- **Gemini CLI**: `~/.gemini/skills/`
- **Claude Code**: `~/.claude/skills/`
- **Universal**: `~/.agents/skills/`

## Usage

In your agent's chat, use the `/backend-project-structure` command:

- `scaffold <ServiceName>`: Generate the folder structure and boilerplate for a new service.
- `add-listener <Service> <Event>`: Generate a message listener in the correct location.
- `audit`: Check the current directory for architectural violations.
- `where <code-snippet>`: Ask where a piece of logic belongs.
