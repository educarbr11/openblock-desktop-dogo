# OpenBlock Blocks generator bundles

These files are generated from `openblock-blocks` commit
`3683be864bae77bb198a5176a7e659c167cfa4e3` and are copied into the desktop
dependency before the GUI compatibility patches run.

The upstream repository intentionally ignores `arduino_compressed.js` and
`python_compressed.js`, and its legacy build requires Python 2. Keeping the
generated bundles here makes tagged desktop builds deterministic on GitHub
Actions. Update both bundles and the pinned Blocks commit together.
