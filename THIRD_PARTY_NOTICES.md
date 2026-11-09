# Third-party components

The application uses Angular, RxJS, TypeBox, AJV's generated validation code, YAML, Wasmoon, Tauri, and their dependencies. Their licenses remain in force. npm metadata and the lockfile identify exact installed versions. The production build's full JavaScript notices are retained in `dist/game/3rdpartylicenses.txt`.

Wasmoon embeds Lua 5.4 compiled to WebAssembly. The runtime is copied unchanged from the installed package to `apps/game/public/runtime/lua.wasm` and the production assets. Wasmoon's MIT license is included in `docs/licenses/wasmoon.txt`; the Lua MIT license is included in `docs/licenses/lua.txt`.

The application icon SVG was authored for this handover and converted with the Tauri icon utility. No third-party artwork, remote fonts, or hosted assets are required at runtime.

No license has been selected for the original project source. This notice does not relicense third-party code or decide the project's eventual distribution terms.
