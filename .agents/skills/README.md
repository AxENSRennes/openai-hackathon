# Project agent skills

This project includes all six [Anti Slop](https://github.com/miqdadbadjuber/anti-slop) skills, installed locally for Codex and other agents that read `.agents/skills/`.

- Version: `3.2.25`
- Source commit: `941b1532f9cc8ffde766bca5921d75257c9e5762`
- Source directory: [`skills/`](https://github.com/miqdadbadjuber/anti-slop/tree/941b1532f9cc8ffde766bca5921d75257c9e5762/skills)
- License for all six skills: [MIT](antislop/LICENSE). The UI and accessibility skills also retain their bundled third-party license notices.

`AGENTS.md` loads the core and points to the companion skills for UI, copywriting, accessibility, responsive layouts, and code comments. Each skill retains its upstream contents, with trailing whitespace removed from the Core Web Vitals reference. The upstream MIT license is included in the core folder.

The skills are available on the next turn. No global installation or mode preference is set by this project installation. Resolve usage mode as described in the core skill when applying it.

To update only this project's copies, review a newer upstream commit and replace the six `antislop*` directories from its `skills/` directory. Preserve the MIT license and update the version and source commit recorded here.
