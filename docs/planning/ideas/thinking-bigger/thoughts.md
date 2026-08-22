Take a look at @../thinking-differently/**

Understand where my thought is coming from.

Thought 1:

- Think: https://github.com/get-bb/bb
- Written in: Rust
- Using: GPUI (https://github.com/zed-industries/awesome-gpui)
- Drawing inspiration from: https://github.com/cloudflare/cloudflare-os
- With a basic set of "widgets" that ship.

Thought 2:

- Think: https://github.com/get-bb/bb
- Meets: https://github.com/cloudflare/cloudflare-os
- Draws inspiration from: GPUI (https://github.com/zed-industries/awesome-gpui)
- But: uses webgpu & wasm to accellerate performance
- WebGPU written with: https://github.com/ericdrowell/brometal
- Deployable to Cloud using: https://github.com/denoland/celld
- Local Tauri Rust app can spin up (https://github.com/denoland/celld) in itself and run the whole app locally for users who don't want in cloude


----

Goal is starts with our opinionated direction of zd, but allows complete customization of itself over time. Adding new mini-apps or widgests, adding new panels, adding new hotkeys and potentially completely redesigning its own ui.
