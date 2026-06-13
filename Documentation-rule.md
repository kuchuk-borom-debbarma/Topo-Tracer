# Topo-Tracer: Documentation Guidelines

To maintain a clean, readable, and highly professional codebase for Topo-Tracer, **all project documentation must strictly adhere to the following rules**. 

Failure to follow these rules will result in rejected pull requests or automated cleanup workflows removing non-compliant files.

---

## 1. Strict Numerical & Directory Organization
*   **Root Alignment:** All root-level documentation directories and files inside `docs/` must begin with a numerical prefix representing their logical sequence (e.g., `1.system_architecture/`, `2.trace_pipeline/`).
*   **Sub-components:** Related sub-component specifications must be grouped into dedicated subdirectories using numeric naming (e.g., `1.system_architecture/1.1.system_overview.md`).
*   **Mandatory Indexes:** Every subdirectory must be listed and linked in the root `docs/README.md` to serve as a master table of contents.

---

## 2. Aggressive Removal of Stale Content
*   **No Orphans or Drafts:** Any document that becomes obsolete, describes defunct architecture (e.g. `carno.js`), or no longer matches the active codebase structure **must be deleted immediately**. 
*   **Architectural Truth:** Documentation must reflect the *actual* implemented code. Do not keep unused design drafts, hypothetical "future" designs, or deprecated plans around as truth. If it is not in the active codebase, it does not belong in the primary documentation.

---

## 3. Mandatory Updates on Code Changes
*   **Living Documents:** When features, schemas, or endpoints are modified, developers must rewrite and update the existing specification documents in the same PR.
*   **No Patchwork:** Do not simply append notes to the bottom of an outdated file. Rewrite the document so that it reads cohesively from top to bottom based on the new reality.

---

## 4. Professional Document Sizing & Formatting
*   **No Fragments:** **Do not create small, fragmented files** for minor changes or single-component notes. Instead, group related topics into high-quality, comprehensive manuals (e.g., combining Postgres and ClickHouse schemas under `3.1.database_schemas.md`).
*   **Formatting Mandates:** 
    *   Use clear Markdown headings (`#`, `##`, `###`).
    *   Include proper syntax highlighting for all code blocks (e.g., ```ts, ```sql).
    *   Use absolute paths or relative standard Markdown links when referencing other documents or code files.
